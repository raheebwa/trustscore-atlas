"""Regeneration SQL for the serving database.

Two constraints from the platform shape everything here: one SQL statement may not exceed
100,000 bytes, and an import blocks the database while it runs. So tables are created and
loaded under staged names (<table>__<regeneration_id>) in many small statements, and a
separate short batch swaps them into place.
"""

import json
import re
from datetime import datetime
from pathlib import Path

STATEMENT_LIMIT = 100_000
_TARGET = 90_000
STAGED_TABLES = ("businesses", "identifiers", "statements", "scores", "sources", "businesses_fts")
PERSISTENT_TABLES = ("regenerations", "meta")

BUSINESS_COLUMNS = [
    "atlas_id", "country", "canonical_name", "name_normalised", "name_variants", "entity_kind",
    "sector_category", "sector_nature", "district", "division", "first_seen", "last_seen",
    "coverage", "scores",
]  # fmt: skip
STATEMENT_COLUMNS = [
    "statement_id", "atlas_id", "entity_id", "country", "field", "value", "source", "source_ref",
    "source_record_id", "asserted_at", "licence", "precedence", "confidence",
]  # fmt: skip
SCORE_COLUMNS = [
    "atlas_id", "rubric", "version", "regeneration_id", "value", "max", "checkable", "unknown",
    "coverage", "evidence", "evaluation_as_of",
]  # fmt: skip
REGENERATION_ID = re.compile(r"^[A-Za-z0-9_]+$")
SOURCE_COLUMNS = [
    "slug", "country", "publisher", "title", "url", "licence", "cadence", "coverage",
    "last_run_id", "last_run_at", "row_count", "adapter_version", "status", "status_note",
]  # fmt: skip


def _json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def quote(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int | float):
        return str(value)
    if isinstance(value, datetime):
        value = value.isoformat().replace("+00:00", "Z")
    if isinstance(value, dict | list):
        value = _json(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_statements(table: str, columns: list[str], rows: list[dict]) -> list[str]:
    head = f"INSERT INTO {table} ({', '.join(columns)}) VALUES "
    out: list[str] = []
    batch: list[str] = []
    size = len(head)
    for row in rows:
        tup = "(" + ", ".join(quote(row.get(c)) for c in columns) + ")"
        if len(head) + len(tup.encode("utf-8")) + 1 > STATEMENT_LIMIT:
            raise ValueError(f"a single row for {table} exceeds the {STATEMENT_LIMIT}-byte limit")
        if batch and size + len(tup.encode("utf-8")) + 3 > _TARGET:
            out.append(head + ", ".join(batch) + ";")
            batch, size = [], len(head)
        batch.append(tup)
        size += len(tup.encode("utf-8")) + 2
    if batch:
        out.append(head + ", ".join(batch) + ";")
    return out


def _schema_statements(schema_path: Path) -> list[str]:
    text = "\n".join(
        line
        for line in Path(schema_path).read_text().splitlines()
        if not line.lstrip().startswith("--")
    )
    text = re.sub(r"--[^\n]*", "", text)
    return [s.strip() + ";" for s in text.split(";") if s.strip()]


def _staged(statement: str, rid: str) -> str:
    return re.sub(
        r"^CREATE (VIRTUAL )?TABLE (\w+)",
        lambda m: f"CREATE {m.group(1) or ''}TABLE {m.group(2)}__{rid}",
        statement,
    )


def _table_of(statement: str) -> str | None:
    m = re.match(r"^CREATE (?:VIRTUAL )?TABLE (\w+)", statement)
    return m.group(1) if m else None


def _check_regeneration_id(rid: str) -> str:
    if not REGENERATION_ID.match(rid or ""):
        raise ValueError(f"regeneration id {rid!r} is not identifier-safe")
    return rid


def apply_batch(conn, lines: list[str] | str) -> None:
    """Apply generated SQL as one transaction on a sqlite3 connection (local loads and tests).

    Statements may span lines (the CREATE TABLE blocks do), so lines are accumulated until
    sqlite reports a complete statement. The serving database receives the same text as one
    batch, which D1 runs atomically.
    """
    import sqlite3

    text = lines if isinstance(lines, str) else "\n".join(lines)
    previous = conn.isolation_level
    conn.isolation_level = None  # explicit transaction control
    buffer: list[str] = []
    try:
        conn.execute("BEGIN")
        for line in text.splitlines():
            if not line.strip() and not buffer:
                continue
            buffer.append(line)
            candidate = "\n".join(buffer)
            if sqlite3.complete_statement(candidate):
                conn.execute(candidate)
                buffer = []
        if buffer and "".join(buffer).strip():
            raise ValueError("trailing incomplete SQL statement in batch")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.isolation_level = previous


def business_rows(businesses: list[dict], scores: list[dict]) -> list[dict]:
    summary: dict[str, dict] = {}
    for s in scores:
        summary.setdefault(s["atlas_id"], {})[s["rubric"]] = {
            "checkable": s["checkable"],
            "max": s["max"],
            "unknown": s["unknown"],
            "value": s["value"],
            "version": s["version"],
        }
    rows = []
    for b in businesses:
        sector, location = b.get("sector", {}), b.get("location", {})
        rows.append(
            {
                "atlas_id": b["atlas_id"],
                "country": b["country"],
                "canonical_name": b["canonical_name"],
                "name_normalised": b["name_normalised"],
                "name_variants": _json(b.get("name_variants", [])),
                "entity_kind": b["entity_kind"],
                "sector_category": sector.get("source_category"),
                "sector_nature": sector.get("source_nature"),
                "district": location.get("district"),
                "division": location.get("division_or_subcounty"),
                "first_seen": b["first_seen"],
                "last_seen": b["last_seen"],
                "coverage": _json(b["coverage"]),
                "scores": _json(summary.get(b["atlas_id"], {})),
            }
        )
    return rows


def regeneration_sql(
    schema_path: Path,
    regeneration: dict,
    businesses: list[dict],
    statements: list[dict],
    scores: list[dict],
    sources: list[dict],
) -> list[str]:
    rid = _check_regeneration_id(regeneration["id"])
    out: list[str] = []
    for stmt in _schema_statements(schema_path):
        table = _table_of(stmt)
        if table in STAGED_TABLES:
            out.append(_staged(stmt, rid))
        elif table in PERSISTENT_TABLES:
            out.append(stmt.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1))
    out += insert_statements(
        f"businesses__{rid}", BUSINESS_COLUMNS, business_rows(businesses, scores)
    )
    out += insert_statements(
        f"identifiers__{rid}",
        ["atlas_id", "scheme", "value", "source"],
        [{"atlas_id": b["atlas_id"], **i} for b in businesses for i in b["identifiers"]],
    )
    out += insert_statements(f"statements__{rid}", STATEMENT_COLUMNS, statements)
    out += insert_statements(
        f"scores__{rid}",
        SCORE_COLUMNS,
        [
            {
                **s,
                "regeneration_id": rid,
                "coverage": _json(s["coverage"]),
                "evidence": _json(s["evidence"]),
            }
            for s in scores
        ],
    )
    out += insert_statements(f"sources__{rid}", SOURCE_COLUMNS, sources)
    out += insert_statements(
        f"businesses_fts__{rid}",
        ["atlas_id", "name", "name_variants", "identifiers"],
        [
            {
                "atlas_id": b["atlas_id"],
                "name": b["canonical_name"],
                "name_variants": " ".join(b.get("name_variants", [])),
                "identifiers": " ".join(i["value"] for i in b["identifiers"]),
            }
            for b in businesses
        ],
    )
    out += insert_statements(
        "regenerations",
        ["id", "started_at", "finished_at", "inputs", "status"],
        [{**regeneration, "inputs": _json(regeneration["inputs"]), "status": "staged"}],
    )
    return out


def swap_sql(schema_path: Path, regeneration: dict) -> list[str]:
    rid = _check_regeneration_id(regeneration["id"])
    out: list[str] = []
    for table in STAGED_TABLES:
        out.append(f"DROP TABLE IF EXISTS {table};")
        out.append(f"ALTER TABLE {table}__{rid} RENAME TO {table};")
    for stmt in _schema_statements(schema_path):
        if stmt.startswith("CREATE INDEX"):
            out.append(stmt)
    out.append(
        f"INSERT OR REPLACE INTO meta (key, value) VALUES ('live_regeneration', {quote(rid)});"
    )
    out.append(f"UPDATE regenerations SET status = 'live' WHERE id = {quote(rid)};")
    out.append(
        "UPDATE regenerations SET status = 'superseded' "
        f"WHERE status = 'live' AND id <> {quote(rid)};"
    )
    return out
