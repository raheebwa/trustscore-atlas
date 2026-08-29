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


def _evidence(predicate: dict, binding: dict, coverage: dict, statements: list[dict]) -> dict:
    row = {"predicate": predicate["id"], "points": 0}
    sources = binding.get("sources", [])
    schemes = set(binding.get("identifier_schemes", []))
    if not sources and not schemes:
        return row | {"reason": NOT_BOUND}
    if sources and not any(s in coverage["checked"] for s in sources):
        return row | {"reason": NOT_LOADED}
    # Sources gate whether the predicate was checked; identifier schemes, when declared, are
    # the evidence itself. A listed source's unrelated identifier never satisfies a scheme
    # predicate.
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
    if not proof:
        return row | {"reason": NO_EVIDENCE}
    return row | {
        "points": predicate["points"],
        "statement_ids": sorted(p["statement_id"] for p in proof),
        "as_of": _as_of(proof),
    }


def score(rubric: Rubric, business: dict, statements: list[dict], *, evaluation_as_of: str) -> dict:
    """Evaluate one rubric. The value is reported next to what was checkable: the unknown mass
    (predicates whose registers were not checked) is separated, never folded into the score."""
    coverage = business["coverage"]
    evidence = []
    unknown_predicates = []
    checkable = 0
    for p in rubric.predicates:
        row = _evidence(p, rubric.bindings.get(p["id"], {}), coverage, statements)
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
