"""Resolution: statements -> canonical business records.

Version 0 groups statements by source entity id (no cross-source merging yet) and chooses
the winning value per field by precedence, then support (number of source records carrying
the value), then recency, then the shortest normalised form, then alphabetical order.
"""

import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime

LEGAL_SUFFIXES = re.compile(r"\b(LTD|LIMITED|PLC|INC|LLC|CORP|CORPORATION)\b")
FIELD_GROUPS = {"sector": "sector.", "location": "location."}


def normalise_name(name: str) -> str:
    text = name.upper().replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    text = " ".join(text.split())
    return re.sub(r"\bLIMITED\b", "LTD", text)


def entity_kind(name: str) -> str:
    return "company" if LEGAL_SUFFIXES.search(name.upper()) else "unknown"


def _dt(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def rank_values(statements: list[dict]) -> list[str]:
    """Distinct values for one field, best first, per the tie-break contract."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for s in statements:
        groups[s["value"]].append(s)

    def key(value: str):
        rows = groups[value]
        return (
            min(r["precedence"] for r in rows),
            -len({r["source_record_id"] for r in rows}),
            -max(_dt(r["asserted_at"]) for r in rows).timestamp(),
            len(normalise_name(value)),
            value,
        )

    return sorted(groups, key=key)


def choose_name(statements: list[dict]) -> tuple[str, list[str]]:
    ranked = rank_values(statements)
    return ranked[0], ranked[1:]


def new_atlas_id(entity_id: str) -> str:
    """Identifier for an entity seen for the first time: a hash of (source, source entity key).

    Never derived from personal-data columns or from the linkage salt. Once issued it is pinned in
    the crosswalk, so later re-pulls keep it even if the derivation rule changes.
    """
    return "atl_" + hashlib.sha256(entity_id.encode("utf-8")).hexdigest()[:16]


def pack_sources(pack: dict) -> list[dict]:
    return [s if isinstance(s, dict) else {"slug": s, "state": "loaded"} for s in pack["sources"]]


@dataclass
class Resolution:
    businesses: list[dict] = field(default_factory=list)
    statements: list[dict] = field(default_factory=list)
    crosswalk: dict[str, str] = field(default_factory=dict)
    new_entities: list[str] = field(default_factory=list)
    groups: dict[str, list[str]] = field(default_factory=dict)
    aliases: list[dict] = field(default_factory=list)


def _issuer_unique_schemes(pack: dict) -> set[str]:
    schemes = pack.get("identifier_schemes") or {}
    return {name for name, spec in schemes.items() if (spec or {}).get("issuer_unique")}


class _Groups:
    """Union-find over entity ids."""

    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def add(self, item: str) -> None:
        self.parent.setdefault(item, item)

    def find(self, item: str) -> str:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            # deterministic: the lexically smaller root survives
            if rb < ra:
                ra, rb = rb, ra
            self.parent[rb] = ra

    def members(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = defaultdict(list)
        for item in self.parent:
            out[self.find(item)].append(item)
        return {root: sorted(items) for root, items in out.items()}


def _group_entities(
    by_entity: dict[str, list[dict]], unique_schemes: set[str]
) -> dict[str, list[str]]:
    """Entities sharing an issuer-unique identifier value are one business (DEC-ATLAS-011 B8).
    Every other similarity is a candidate produced elsewhere, never a merge here."""
    groups = _Groups()
    holders: dict[tuple[str, str], str] = {}
    for entity_id in sorted(by_entity):
        groups.add(entity_id)
        for s in by_entity[entity_id]:
            if s["field"] != "identifiers":
                continue
            ident = json.loads(s["value"])
            key = (ident.get("scheme"), ident.get("value"))
            if key[0] not in unique_schemes or not key[1]:
                continue
            if key in holders:
                groups.union(holders[key], entity_id)
            else:
                holders[key] = entity_id
    return groups.members()


@dataclass
class _Decisions:
    matched: set[tuple[str, str]] = field(default_factory=set)
    blocked: set[tuple[str, str]] = field(default_factory=set)


def _latest_verdicts(labels: list[dict]) -> _Decisions:
    """Labels are append-only; the latest verdict per unordered pair of atlas ids wins."""
    latest: dict[tuple[str, str], tuple[str, str]] = {}
    for label in labels:
        pair = tuple(sorted((label["atlas_id"], label["candidate_atlas_id"])))
        stamp = str(label.get("labelled_at", ""))
        if pair not in latest or stamp >= latest[pair][0]:
            latest[pair] = (stamp, label["verdict"])
    out = _Decisions()
    for pair, (_, verdict) in latest.items():
        (out.matched if verdict == "match" else out.blocked).add(pair)
    return out


def _apply_labels(
    groups: dict[str, list[str]], crosswalk: dict, decisions: _Decisions
) -> dict[str, list[str]]:
    """Union groups joined by a match label; split groups whose members are blocked by a
    non_match label (the blocked member keeps its own known id). Decisions refer to atlas ids,
    so members are mapped through the crosswalk."""
    if not decisions.matched and not decisions.blocked:
        return groups
    entity_atlas = {}
    for members in groups.values():
        for m in members:
            known = _known(crosswalk, m)
            if known:
                entity_atlas[m] = known[0]
    uf = _Groups()
    for members in groups.values():
        for m in members:
            uf.add(m)
        for m in members[1:]:
            uf.union(members[0], m)
    by_atlas: dict[str, list[str]] = defaultdict(list)
    for m, a in entity_atlas.items():
        by_atlas[a].append(m)
    for a, b in decisions.matched:
        if by_atlas.get(a) and by_atlas.get(b):
            uf.union(by_atlas[a][0], by_atlas[b][0])
    merged = uf.members()
    if not decisions.blocked:
        return merged
    out: dict[str, list[str]] = {}
    for root, members in merged.items():
        keep = list(members)
        for a, b in decisions.blocked:
            side_a = [m for m in keep if entity_atlas.get(m) == a]
            side_b = [m for m in keep if entity_atlas.get(m) == b]
            if side_a and side_b:
                for m in side_b:
                    keep.remove(m)
                    out[m] = [m]
        out[root] = keep
    return out


def _known(crosswalk: dict, entity_id: str) -> tuple[str, str] | None:
    entry = crosswalk.get(entity_id)
    if entry is None:
        return None
    if isinstance(entry, str):
        return entry, ""
    return entry["atlas_id"], entry.get("first_regeneration_id", "")


def _choose_atlas_id(members: list[str], crosswalk: dict) -> tuple[str, list[str]]:
    """The oldest known id survives; other known ids become aliases; unknown groups get a new id
    derived from their lexically first entity id."""
    known = sorted(
        {k for k in (_known(crosswalk, m) for m in members) if k},
        key=lambda k: (k[1], k[0]),
    )
    if not known:
        return new_atlas_id(members[0]), []
    survivor = known[0][0]
    return survivor, [k[0] for k in known[1:] if k[0] != survivor]


def resolve(
    statements: list[dict],
    *,
    pack: dict,
    checked_sources: list[str],
    crosswalk: dict | None = None,
    labels: list[dict] | None = None,
) -> Resolution:
    by_entity: dict[str, list[dict]] = defaultdict(list)
    for s in statements:
        by_entity[s["entity_id"]].append(s)

    sources = pack_sources(pack)
    applicable = [s["slug"] for s in sources if s["state"] != "disabled"]
    loaded = {s["slug"] for s in sources if s["state"] == "loaded"}
    checked = [s for s in applicable if s in loaded and s in checked_sources]
    not_yet_checked = [s for s in applicable if s not in checked]
    crosswalk = dict(crosswalk or {})
    unique_schemes = _issuer_unique_schemes(pack)
    result = Resolution(crosswalk={k: (_known(crosswalk, k) or ("", ""))[0] for k in crosswalk})

    decisions = _latest_verdicts(labels or [])
    groups = _group_entities(by_entity, unique_schemes)
    groups = _apply_labels(groups, crosswalk, decisions)
    for members in groups.values():
        rows = [s for m in members for s in by_entity[m]]
        by_field: dict[str, list[dict]] = defaultdict(list)
        for s in rows:
            by_field[s["field"]].append(s)

        atlas_id, aliased = _choose_atlas_id(members, crosswalk)
        for old in aliased:
            reason = (
                "label:match"
                if (old, atlas_id) in decisions.matched or (atlas_id, old) in decisions.matched
                else ",".join(sorted(unique_schemes))
            )
            result.aliases.append(
                {"atlas_id": old, "canonical_atlas_id": atlas_id, "reason": reason}
            )
        for m in members:
            if _known(crosswalk, m) is None:
                result.crosswalk[m] = atlas_id
                result.new_entities.append(m)
        result.groups[atlas_id] = members

        ident_rows = [
            {**json.loads(s["value"]), "source": s["source"], "asserted_at": _dt(s["asserted_at"])}
            for s in by_field.get("identifiers", [])
        ]
        identifiers = sorted({(i["scheme"], i["value"], i["source"]) for i in ident_rows})
        name, variants = choose_name(by_field["canonical_name"])
        seen = [_dt(s["asserted_at"]) for s in rows]
        business = {
            "atlas_id": atlas_id,
            "country": pack["country"],
            "canonical_name": name,
            "name_normalised": normalise_name(name),
            "name_variants": variants,
            "entity_kind": entity_kind(name),
            "first_seen": min(seen).date().isoformat(),
            "last_seen": max(seen).date().isoformat(),
            "identifiers": [
                {"scheme": scheme, "value": value, "source": source}
                for scheme, value, source in identifiers
            ],
            "coverage": {
                "applicable": applicable,
                "checked": checked,
                "found_in": sorted({s["source"] for s in rows if s["source"] in checked}),
                "not_yet_checked": not_yet_checked,
            },
        }
        for group, prefix in FIELD_GROUPS.items():
            values = {
                f.removeprefix(prefix): rank_values(v)
                for f, v in by_field.items()
                if f.startswith(prefix)
            }
            if values:
                business[group] = {k: v[0] for k, v in values.items()}
        result.businesses.append(business)
        result.statements.extend({**s, "atlas_id": atlas_id} for s in rows)
    result.businesses.sort(key=lambda b: b["atlas_id"])
    result.statements.sort(key=lambda s: (s["atlas_id"], s["statement_id"]))
    return result
