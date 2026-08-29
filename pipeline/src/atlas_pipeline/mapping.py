"""Apply statements.map.yml to typed records to produce statements."""

import hashlib
import json
from datetime import datetime

PRECEDENCE = {
    "operator_verified": 1,
    "register_of_record": 2,
    "regulator_or_authority": 3,
    "derived": 4,
    "inferred": 5,
}


def normalise(value: str | None) -> str:
    return " ".join((value or "").upper().split())


def key_hash(record: dict, columns: list[str], normalised: list[str] = ()) -> str:
    parts = []
    for column in columns:
        value = record.get(column) or ""
        parts.append(normalise(value) if column in normalised else str(value))
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


def statement_id(entity_id: str, field: str, value: str, source: str, record_id: str) -> str:
    raw = "\x1f".join((entity_id, field, value, source, record_id))
    return hashlib.md5(raw.encode("utf-8")).hexdigest()  # noqa: S324 (identifier, not security)


def build_statements(
    records: list[dict], mapping: dict, source: dict, asserted_at: datetime
) -> list[dict]:
    slug = source["slug"]
    precedence = PRECEDENCE[mapping["precedence_class"]]
    out: dict[str, dict] = {}
    for record in records:
        entity_id = f"{slug}:{record['_entity_key']}"
        for spec in mapping["statements"]:
            if "value" in spec:
                value = spec["value"]
            elif spec.get("from") == "entity_key":
                value = json.dumps(
                    {"scheme": spec["identifier"], "value": record["_entity_key"]},
                    sort_keys=True,
                    separators=(",", ":"),
                )
            else:
                value = record.get(spec["from"])
            if value is None or value == "":
                continue
            sid = statement_id(entity_id, spec["field"], value, slug, record["record_id"])
            out[sid] = {
                "statement_id": sid,
                "entity_id": entity_id,
                "country": mapping["country"],
                "field": spec["field"],
                "value": value,
                "source": slug,
                "source_ref": record[mapping["source_ref"]["from"]],
                "source_record_id": record["record_id"],
                "asserted_at": asserted_at,
                "licence": source["licence"],
                "precedence": precedence,
                "confidence": mapping["confidence"],
            }
    return [out[k] for k in sorted(out)]
