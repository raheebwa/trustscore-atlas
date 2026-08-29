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


def resolve(
    statements: list[dict],
    *,
    pack: dict,
    checked_sources: list[str],
    crosswalk: dict[str, str] | None = None,
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
    result = Resolution(crosswalk=crosswalk)
    for entity_id in sorted(by_entity):
        rows = by_entity[entity_id]
        by_field: dict[str, list[dict]] = defaultdict(list)
        for s in rows:
            by_field[s["field"]].append(s)

        ident_rows = [
            {**json.loads(s["value"]), "source": s["source"], "asserted_at": _dt(s["asserted_at"])}
            for s in by_field.get("identifiers", [])
        ]
        identifiers = sorted({(i["scheme"], i["value"], i["source"]) for i in ident_rows})
        atlas_id = crosswalk.get(entity_id)
        if atlas_id is None:
            atlas_id = new_atlas_id(entity_id)
            crosswalk[entity_id] = atlas_id
            result.new_entities.append(entity_id)
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
                f.removeprefix(prefix): rank_values(v)[0]
                for f, v in by_field.items()
                if f.startswith(prefix)
            }
            if values:
                business[group] = values
        result.businesses.append(business)
        result.statements.extend({**s, "atlas_id": atlas_id} for s in rows)
    return result
