"""Rubric evaluation: a pure function of a business, its statements and a rubric version."""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import yaml

NOT_BOUND = "not checked (no register bound in this pack)"
NOT_LOADED = "not checked (registers not yet loaded)"
NO_EVIDENCE = "no evidence in checked registers"


@dataclass(frozen=True)
class Rubric:
    name: str
    version: int
    max: int
    predicates: list[dict]
    bindings: dict


def load_rubric(rubric_path: Path, bindings_path: Path) -> Rubric:
    rubric = yaml.safe_load(Path(rubric_path).read_text())
    bindings = yaml.safe_load(Path(bindings_path).read_text())[rubric["name"]]
    return Rubric(rubric["name"], rubric["version"], rubric["max"], rubric["predicates"], bindings)


def _as_of(statements: list[dict]) -> str:
    latest = max(
        (
            s["asserted_at"]
            if isinstance(s["asserted_at"], datetime)
            else datetime.fromisoformat(str(s["asserted_at"]).replace("Z", "+00:00"))
        )
        for s in statements
    )
    return latest.astimezone(UTC).date().isoformat()


ADVERSE = {"suspended", "deactivated", "revoked", "cancelled", "withdrawn", "expired", "terminated"}


def _split(spec: str) -> tuple[str, str]:
    """'ura.customs_agents.licence.expiry_date' -> (source slug, field)."""
    publisher, register, field = spec.split(".", 2)
    return f"{publisher}.{register}", field


def _bound_sources(binding: dict) -> set[str]:
    sources = set(binding.get("sources", []))
    for key in (
        "expiry_fields",
        "date_fields",
        "status_fields",
        "role_fields",
        "count_fields",
        "buyer_fields",
    ):
        sources |= {_split(spec)[0] for spec in binding.get(key, [])}
    return sources


def _rows(statements: list[dict], specs: list[str]) -> list[dict]:
    wanted = {_split(spec) for spec in specs}
    return [s for s in statements if (s["source"], s["field"]) in wanted]


def _date(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value)[:10]).replace(tzinfo=UTC)
    except ValueError:
        return None


def _months_before(as_of: str, months: int) -> datetime:
    at = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
    month = at.month - months
    year = at.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return at.replace(year=year, month=month)


def _proof(row: dict, predicate: dict, rows: list[dict]) -> dict:
    return row | {
        "points": predicate["points"],
        "statement_ids": sorted(r["statement_id"] for r in rows),
        "as_of": _as_of(rows),
    }


def _fail(row: dict, reason: str, rows: list[dict]) -> dict:
    out = row | {"reason": reason}
    if rows:
        out["statement_ids"] = sorted(r["statement_id"] for r in rows)
        out["as_of"] = _as_of(rows)
    return out


def _identifier_evidence(row, predicate, binding, statements):
    sources = binding.get("sources", [])
    schemes = set(binding.get("identifier_schemes", []))
    proof = []
    for s in statements:
        if s["field"] != "identifiers":
            continue
        scheme = json.loads(s["value"]).get("scheme")
        if schemes:
            if scheme in schemes:
                proof.append(s)
        elif s["source"] in sources:
            proof.append(s)
    return _proof(row, predicate, proof) if proof else row | {"reason": NO_EVIDENCE}


def _recent_statement(row, predicate, binding, statements, business, as_of):
    since = _months_before(as_of, predicate.get("window_months", 12))
    recent = [
        s
        for s in statements
        if s["source"] in set(binding.get("sources", []))
        and datetime.fromisoformat(str(s["asserted_at"]).replace("Z", "+00:00")) >= since
    ]
    return _proof(row, predicate, recent) if recent else row | {"reason": NO_EVIDENCE}


def _valid_licence(row, predicate, binding, statements, business, as_of):
    rows = _rows(statements, binding.get("expiry_fields", []))
    today = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
    current = [r for r in rows if (_date(r["value"]) or today) >= today and _date(r["value"])]
    if current:
        return _proof(row, predicate, current)
    if rows:
        return _fail(row, "licence or permit expired", rows)
    return row | {"reason": NO_EVIDENCE}


def _dated_within(row, predicate, binding, statements, business, as_of, late_reason):
    rows = _rows(statements, binding.get("date_fields", []))
    since = _months_before(as_of, predicate.get("window_months", 24))
    recent = [r for r in rows if (d := _date(r["value"])) and d >= since]
    if recent:
        return _proof(row, predicate, recent)
    if rows:
        return _fail(row, late_reason, rows)
    return row | {"reason": NO_EVIDENCE}


def _multiple_registers(row, predicate, binding, statements, business, as_of):
    found = business["coverage"].get("found_in", [])
    if len(found) >= binding.get("minimum", 2):
        proof = [s for s in statements if s["field"] == "identifiers" and s["source"] in found]
        return _proof(row, predicate, proof) if proof else row | {"points": predicate["points"]}
    return row | {"reason": NO_EVIDENCE}


def _no_adverse_status(row, predicate, binding, statements, business, as_of):
    rows = _rows(statements, binding.get("status_fields", []))
    adverse = [r for r in rows if str(r["value"]).strip().lower() in ADVERSE]
    if adverse:
        return _fail(row, "adverse status in a register", adverse)
    return _proof(row, predicate, rows) if rows else row | {"reason": NO_EVIDENCE}


def _permits_current(row, predicate, binding, statements, business, as_of):
    rows = _rows(statements, binding.get("status_fields", []))
    if not rows:
        return row | {"reason": NO_EVIDENCE}
    current = {v.lower() for v in binding.get("current_values", ["Valid"])}
    good = sum(1 for r in rows if str(r["value"]).strip().lower() in current)
    if good * 2 > len(rows):
        return _proof(row, predicate, rows)
    return _fail(row, "most permits not current", rows)


def _registered_party(row, predicate, binding, statements, business, as_of):
    rows = _rows(statements, binding.get("role_fields", []))
    wanted = {r.lower() for r in binding.get("roles", [])}
    proof = [r for r in rows if wanted & {p.strip().lower() for p in str(r["value"]).split(";")}]
    return _proof(row, predicate, proof) if proof else row | {"reason": NO_EVIDENCE}


def _count_at_least(rows: list[dict], minimum: int) -> bool:
    return any(str(r["value"]).isdigit() and int(r["value"]) >= minimum for r in rows)


def _any_award(row, predicate, binding, statements, business, as_of):
    rows = _rows(statements, binding.get("count_fields", []))
    if not rows:
        return row | {"reason": NO_EVIDENCE}
    return (
        _proof(row, predicate, rows)
        if _count_at_least(rows, 1)
        else _fail(row, "no award recorded", rows)
    )


def _awards_across_buyers(row, predicate, binding, statements, business, as_of):
    counts = _rows(statements, binding.get("count_fields", []))
    buyers = _rows(statements, binding.get("buyer_fields", []))
    if not counts and not buyers:
        return row | {"reason": NO_EVIDENCE}
    ok = _count_at_least(counts, predicate.get("minimum_awards", 3)) and _count_at_least(
        buyers, predicate.get("minimum_buyers", 2)
    )
    return (
        _proof(row, predicate, counts + buyers)
        if ok
        else _fail(row, "fewer than three awards across two buyers", counts + buyers)
    )


def _formality_threshold(row, predicate, binding, statements, business, as_of):
    minimum = binding.get("minimum", 55)
    value = (business.get("scores") or {}).get(binding.get("rubric", "formality"), {}).get("value")
    if value is None:
        return row | {"reason": "formality not yet scored"}
    if value >= minimum:
        return row | {
            "points": predicate["points"],
            "reason": f"formality {value} of 100 meets {minimum}",
        }
    return row | {"reason": f"formality {value} of 100 below {minimum}"}


EVALUATORS = {
    "recent_statement": _recent_statement,
    "valid_licence_or_permit": _valid_licence,
    "public_contract_awarded": lambda *a: _dated_within(*a, late_reason="no award within window"),
    "seen_in_multiple_registers": _multiple_registers,
    "no_adverse_status": _no_adverse_status,
    "certification_permits_current": _permits_current,
    "registered_party": _registered_party,
    "any_award": _any_award,
    "awards_across_buyers": _awards_across_buyers,
    "contract_signed_recently": lambda *a: _dated_within(
        *a, late_reason="last contract older than 24 months"
    ),
    "formality_threshold": _formality_threshold,
}


def _evidence(
    predicate: dict,
    binding: dict,
    coverage: dict,
    statements: list[dict],
    business: dict,
    as_of: str,
) -> dict:
    row = {"predicate": predicate["id"], "points": 0}
    if predicate["id"] == "formality_threshold":
        return _formality_threshold(row, predicate, binding, statements, business, as_of)
    if predicate["id"] == "seen_in_multiple_registers":
        return _multiple_registers(row, predicate, binding, statements, business, as_of)
    sources = _bound_sources(binding)
    schemes = set(binding.get("identifier_schemes", []))
    if not sources and not schemes:
        return row | {"reason": NOT_BOUND}
    if sources and not any(s in coverage["checked"] for s in sources):
        return row | {"reason": NOT_LOADED}
    evaluator = EVALUATORS.get(predicate["id"])
    if evaluator is None:
        return _identifier_evidence(row, predicate, binding, statements)
    return evaluator(row, predicate, binding, statements, business, as_of)


def score(rubric: Rubric, business: dict, statements: list[dict], *, evaluation_as_of: str) -> dict:
    """Evaluate one rubric. The value is reported next to what was checkable: the unknown mass
    (predicates whose registers were not checked) is separated, never folded into the score."""
    coverage = business["coverage"]
    evidence = []
    unknown_predicates = []
    checkable = 0
    for p in rubric.predicates:
        row = _evidence(
            p, rubric.bindings.get(p["id"], {}), coverage, statements, business, evaluation_as_of
        )
        evidence.append(row)
        if row.get("reason", "").startswith("not checked"):
            unknown_predicates.append(p["id"])
        else:
            checkable += p["points"]
    return {
        "rubric": rubric.name,
        "version": rubric.version,
        "value": sum(e["points"] for e in evidence),
        "max": rubric.max,
        "checkable": checkable,
        "unknown": rubric.max - checkable,
        "unknown_predicates": unknown_predicates,
        "coverage": {
            k: len(coverage.get(k, []))
            for k in ("applicable", "checked", "found_in", "not_yet_checked")
        },
        "evidence": evidence,
        "evaluation_as_of": evaluation_as_of,
    }
