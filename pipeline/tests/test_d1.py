"""D1 writer: regeneration SQL under the per-statement byte limit, staged names, swap batch."""

import sqlite3
from pathlib import Path

from atlas_pipeline.d1 import (
    STATEMENT_LIMIT,
    apply_batch,
    insert_statements,
    regeneration_sql,
    swap_sql,
)

REPO = Path(__file__).resolve().parents[2]
SCHEMA = REPO / "infra" / "d1" / "schema.sql"


def test_insert_statements_are_chunked_under_the_limit():
    rows = [{"a": "x" * 5000, "b": i} for i in range(100)]
    stmts = insert_statements("t", ["a", "b"], rows)
    assert len(stmts) > 1
    assert all(len(s.encode("utf-8")) <= STATEMENT_LIMIT for s in stmts)
    assert sum(s.count("),") + 1 for s in stmts) == 100
    assert stmts[0].startswith("INSERT INTO t (a, b) VALUES")


def test_insert_statements_escape_quotes_and_nulls():
    (stmt,) = insert_statements("t", ["a", "b"], [{"a": "it's", "b": None}])
    assert stmt == "INSERT INTO t (a, b) VALUES ('it''s', NULL);"


def _sample():
    business = {
        "atlas_id": "atl_0000000000000001",
        "country": "UG",
        "canonical_name": "EXAMPLE BAKERY LTD",
        "name_normalised": "EXAMPLE BAKERY LTD",
        "name_variants": ["Example Bakery Ltd"],
        "entity_kind": "company",
        "sector": {"source_category": "GENERAL", "source_nature": "Bakery"},
        "location": {"district": "Kampala", "division_or_subcounty": "Central Division"},
        "first_seen": "2026-08-01",
        "last_seen": "2026-08-29",
        "identifiers": [
            {"scheme": "ug:kcca_licence", "value": "aaaa", "source": "kcca.businesses"}
        ],
        "coverage": {
            "applicable": ["kcca.businesses"],
            "checked": ["kcca.businesses"],
            "found_in": ["kcca.businesses"],
            "not_yet_checked": [],
        },
    }
    statement = {
        "statement_id": "s1",
        "atlas_id": "atl_0000000000000001",
        "entity_id": "kcca.businesses:aaaa",
        "country": "UG",
        "field": "canonical_name",
        "value": "EXAMPLE BAKERY LTD",
        "source": "kcca.businesses",
        "source_ref": "https://example.org/r",
        "source_record_id": "r1",
        "asserted_at": "2026-08-29T20:31:50Z",
        "licence": "public-record",
        "precedence": 3,
        "confidence": "official",
    }
    score = {
        "atlas_id": "atl_0000000000000001",
        "rubric": "formality",
        "version": 1,
        "value": 25,
        "max": 100,
        "checkable": 25,
        "unknown": 75,
        "unknown_predicates": [
            "legal_register_presence",
            "tax_identity_present",
            "sector_regulator_licence",
        ],
        "coverage": {"applicable": 1, "checked": 1, "found_in": 1, "not_yet_checked": 0},
        "evidence": [
            {
                "predicate": "local_trading_licence",
                "points": 25,
                "statement_ids": ["s1"],
                "as_of": "2026-08-29",
            }
        ],
        "evaluation_as_of": "2026-08-29T10:00:00Z",
    }
    source = {
        "slug": "kcca.businesses",
        "country": "UG",
        "publisher": "Kampala Capital City Authority",
        "title": "Licensed businesses",
        "url": "https://example.org",
        "licence": "public-record",
        "cadence": "quarterly",
        "coverage": "Kampala only",
        "last_run_id": "20260829T203150Z",
        "last_run_at": "2026-08-29T20:31:50Z",
        "row_count": 1,
        "adapter_version": "0.1.0",
        "status": "fresh",
    }
    regeneration = {
        "id": "20260829T210000Z",
        "started_at": "2026-08-29T21:00:00Z",
        "finished_at": "2026-08-29T21:05:00Z",
        "inputs": {"kcca.businesses": "20260829T203150Z"},
    }
    return [business], [statement], [score], [source], regeneration


def test_regeneration_sql_loads_into_sqlite_and_swap_makes_it_live():
    businesses, statements, scores, sources, regeneration = _sample()
    stage = regeneration_sql(SCHEMA, regeneration, businesses, statements, scores, sources)
    swap = swap_sql(SCHEMA, regeneration)
    assert all(len(s.encode()) <= STATEMENT_LIMIT for s in stage + swap)
    rid = regeneration["id"]
    assert any(f"businesses__{rid}" in s for s in stage)
    assert not any(" businesses " in s and "__" not in s for s in stage if s.startswith("CREATE"))

    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA.read_text())  # live tables from a previous regeneration
    db.execute("INSERT INTO meta VALUES ('live_regeneration', 'previous')")
    for s in stage:
        db.execute(s)
    assert db.execute(f"SELECT count(*) FROM businesses__{rid}").fetchone()[0] == 1
    assert db.execute("SELECT count(*) FROM businesses").fetchone()[0] == 0
    for s in swap:
        db.execute(s)
    second = sqlite3.connect(":memory:")
    second.executescript(SCHEMA.read_text())
    stage_s = regeneration_sql(
        SCHEMA, regeneration, businesses, statements, scores, sources, database="DB_STATEMENTS"
    )
    swap_s = swap_sql(SCHEMA, regeneration, database="DB_STATEMENTS")
    assert all(len(s.encode()) <= STATEMENT_LIMIT for s in stage_s + swap_s)
    for s in stage_s + swap_s:
        second.execute(s)
    assert db.execute("SELECT value FROM meta WHERE key='live_regeneration'").fetchone()[0] == rid
    assert db.execute("SELECT canonical_name, division, scores FROM businesses").fetchone() == (
        "EXAMPLE BAKERY LTD",
        "Central Division",
        '{"formality":{"checkable":25,"max":100,"unknown":75,"value":25,"version":1}}',
    )
    assert second.execute("SELECT count(*) FROM statements").fetchone()[0] == 1
    assert db.execute("SELECT scheme, value FROM identifiers").fetchone() == (
        "ug:kcca_licence",
        "aaaa",
    )
    assert db.execute("SELECT status FROM regenerations WHERE id=?", (rid,)).fetchone() == ("live",)
    hit = db.execute(
        "SELECT atlas_id FROM businesses_fts WHERE businesses_fts MATCH 'bak'"
    ).fetchone()
    assert hit == ("atl_0000000000000001",)
    assert not [
        n
        for (n,) in db.execute(
            "SELECT name FROM sqlite_master WHERE name LIKE '%\\_\\_%' ESCAPE '\\'"
        )
    ]


def test_statement_references_are_normalised_into_a_refs_table():
    """Serving tables store each distinct source reference once; statements carry ref_id."""
    businesses, statements, scores, sources, regeneration = _sample()
    statements = [
        statements[0],
        {
            **statements[0],
            "statement_id": "s2",
            "field": "sector.source_category",
            "value": "GENERAL",
        },
        {**statements[0], "statement_id": "s3", "source_ref": "https://example.org/other"},
    ]
    stage = regeneration_sql(
        SCHEMA, regeneration, businesses, statements, scores, sources, database="DB_STATEMENTS"
    )
    swap = swap_sql(SCHEMA, regeneration, database="DB_STATEMENTS")
    db = sqlite3.connect(":memory:")
    apply_batch(db, stage)
    apply_batch(db, swap)
    assert db.execute("SELECT count(*) FROM refs").fetchone() == (2,)
    assert "source_ref" not in [c[1] for c in db.execute("PRAGMA table_info(statements)")]
    joined = db.execute(
        "SELECT s.statement_id, r.source_ref FROM statements s "
        "JOIN refs r ON r.ref_id = s.ref_id ORDER BY 1"
    ).fetchall()
    assert joined == [
        ("s1", "https://example.org/r"),
        ("s2", "https://example.org/r"),
        ("s3", "https://example.org/other"),
    ]
    ref_ids = {row[0] for row in db.execute("SELECT ref_id FROM refs")}
    assert all(len(r) == 12 for r in ref_ids)


def test_same_identifier_from_two_registers_loads_as_two_rows():
    """A business joined across registers on a TIN carries that TIN from each register; the
    identifiers table keys on the source as well, so both provenance rows load."""
    businesses, statements, scores, sources, regeneration = _sample()
    businesses[0]["identifiers"] = [
        {"scheme": "ug:tin", "value": "1000000001", "source": "ura.vat_withholding_agents"},
        {"scheme": "ug:tin", "value": "1000000001", "source": "ura.customs_agents"},
    ]
    stage = regeneration_sql(SCHEMA, regeneration, businesses, statements, scores, sources)
    swap = swap_sql(SCHEMA, regeneration)
    db = sqlite3.connect(":memory:")
    apply_batch(db, stage)
    apply_batch(db, swap)
    rows = db.execute("SELECT scheme, value, source FROM identifiers ORDER BY source").fetchall()
    assert rows == [
        ("ug:tin", "1000000001", "ura.customs_agents"),
        ("ug:tin", "1000000001", "ura.vat_withholding_agents"),
    ]


def test_segment_rows_count_each_business_once_in_the_all_registers_rollup():
    from atlas_pipeline.d1 import segment_rows

    business = {
        "country": "UG",
        "sector": {"source_category": "GENERAL", "source_nature": "Hardware"},
        "location": {"district": "Kampala", "division_or_subcounty": "Central Division"},
        "coverage": {"found_in": ["kcca.businesses", "ura.vat_withholding_agents"]},
    }
    rows = {
        (r["sector_nature"], r["register"]): r["business_count"] for r in segment_rows([business])
    }
    assert rows[("Hardware", "kcca.businesses")] == 1
    assert rows[("Hardware", "ura.vat_withholding_agents")] == 1
    assert rows[(None, "kcca.businesses")] == 1
    assert rows[("Hardware", None)] == 1
    assert rows[(None, None)] == 1


def test_segment_rows_count_a_business_without_nature_once_and_carry_the_country():
    from atlas_pipeline.d1 import segment_rows

    business = {
        "country": "KE",
        "sector": {"source_category": "GENERAL"},
        "location": {"district": None, "division_or_subcounty": None},
        "coverage": {"found_in": ["cbk.licensed_banks"]},
    }
    rows = segment_rows([business])
    assert {r["country"] for r in rows} == {"KE"}
    assert [(r["sector_nature"], r["register"], r["business_count"]) for r in rows] == [
        (None, None, 1),
        (None, "cbk.licensed_banks", 1),
    ]


def test_stage_sql_can_reload_a_regeneration_that_was_live_before():
    """A rollback reloads an earlier regeneration whose regenerations row still exists, so the
    stage must upsert that row instead of failing on the primary key."""
    import sqlite3

    from atlas_pipeline.d1 import apply_batch, regeneration_sql, swap_sql

    schema = Path(__file__).resolve().parents[2] / "infra" / "d1" / "schema.sql"
    regeneration = {
        "id": "20260830T000000Z",
        "started_at": "2026-08-30T00:00:00Z",
        "finished_at": "2026-08-30T00:01:00Z",
        "inputs": {},
    }
    stage = regeneration_sql(schema, regeneration, [], [], [], [], database="DB_SCORES")
    swap = swap_sql(schema, regeneration, database="DB_SCORES")
    db = sqlite3.connect(":memory:")
    apply_batch(db, stage)
    apply_batch(db, swap)
    apply_batch(db, stage)  # the same regeneration loaded again, as a rollback does
    apply_batch(db, swap)
    assert db.execute("SELECT count(*), status FROM regenerations").fetchone() == (1, "live")
