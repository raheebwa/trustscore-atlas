"""Regeneration: every loaded source -> canonical parquet, scores, and serving SQL."""

import json
from pathlib import Path

import pyarrow.parquet as pq

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.regenerate import regenerate

from .conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "kcca_businesses"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


def _slug(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-")


def test_regenerate_from_one_source(tmp_path: Path):
    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_request: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    assert out.directory == tmp_path / "regen" / "20260829T210000Z"
    businesses = pq.read_table(out.directory / "businesses.parquet").to_pylist()
    assert len(businesses) == EXPECTED["entities"]
    scores = pq.read_table(out.directory / "scores.parquet").to_pylist()
    assert {s["rubric"] for s in scores} == {
        "formality",
        "activity",
        "compliance_signals",
        "procurement_readiness",
    }
    assert all(json.loads(s["evidence"]) for s in scores)
    formality = [s for s in scores if s["rubric"] == "formality"]
    assert all(s["value"] == 25 for s in formality)  # KCCA only: local trading licence
    statements = pq.read_table(out.directory / "statements_resolved.parquet")
    assert "atlas_id" in statements.column_names and statements.num_rows == EXPECTED["rows"] * 6
    stage = (out.directory / "stage.sql").read_text()
    swap = (out.directory / "swap.sql").read_text()
    assert "businesses__20260829T210000Z" in stage and "RENAME TO businesses;" in swap
    summary = json.loads((out.directory / "regeneration.json").read_text())
    assert summary["inputs"] == {"kcca.businesses": RUN_ID}
    assert summary["counts"]["businesses"] == EXPECTED["entities"]
    assert summary["sources"][0]["status"] == "fresh"


def test_regenerate_writes_a_prelude_that_frees_the_largest_live_table(tmp_path: Path):
    """On the free plan a database may not exceed 500 MB. Staged tables sit beside live ones
    during an import, so the loader drops the largest live table (statements) before loading
    and keeps the previous regeneration's SQL as the rollback path."""
    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    prelude = (out.directory / "prelude.sql").read_text().splitlines()
    assert prelude == [
        "DROP TABLE IF EXISTS scores;",
        "DROP TABLE IF EXISTS segments;",
        "DROP TABLE IF EXISTS businesses_fts;",
        "DROP TABLE IF EXISTS statements;",
        "DROP TABLE IF EXISTS refs;",
    ]
    statements_prelude = (out.directory / "statements-prelude.sql").read_text().splitlines()
    assert statements_prelude == ["DROP TABLE IF EXISTS statements;"]
    order = json.loads((out.directory / "regeneration.json").read_text())["load_order"]
    assert order["DB"] == ["prelude.sql", "stage.sql", "swap.sql"]


def test_regenerate_writes_precomputed_segments_for_kcca(tmp_path: Path):
    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )

    segments = pq.read_table(out.directory / "segments.parquet").to_pylist()
    assert {row["sector_category"] for row in segments} == {"GENERAL"}
    assert {row["district"] for row in segments} == {"Kampala"}
    assert {row["register"] for row in segments} == {"kcca.businesses", None}
    assert {row["business_count"] for row in segments} == {1}
    assert len(segments) == 12
    expected = {
        ("GENERAL", "Bakery", "Kampala", "Central Division", "kcca.businesses"),
        ("GENERAL", None, "Kampala", "Central Division", "kcca.businesses"),
        ("GENERAL", "Bakery", "Kampala", "Central Division", None),
        ("GENERAL", None, "Kampala", "Central Division", None),
        ("GENERAL", "Bakery", "Kampala", "Nakawa Division", "kcca.businesses"),
        ("GENERAL", None, "Kampala", "Nakawa Division", "kcca.businesses"),
        ("GENERAL", "Bakery", "Kampala", "Nakawa Division", None),
        ("GENERAL", None, "Kampala", "Nakawa Division", None),
        ("GENERAL", "Retailers", "Kampala", "Rubaga Division", "kcca.businesses"),
        ("GENERAL", None, "Kampala", "Rubaga Division", "kcca.businesses"),
        ("GENERAL", "Retailers", "Kampala", "Rubaga Division", None),
        ("GENERAL", None, "Kampala", "Rubaga Division", None),
    }
    assert expected == {
        (
            row["sector_category"],
            row["sector_nature"],
            row["district"],
            row["division"],
            row["register"],
        )
        for row in segments
    }

    summary = json.loads((out.directory / "regeneration.json").read_text())
    assert summary["counts"]["segments"] == 12


def test_regenerate_splits_statements_into_a_second_database(tmp_path: Path):
    """On the free plan each database stays under 500 MB, so statements and refs load into a
    second database bound as DB_STATEMENTS. The writer emits one prelude/stage/swap set per
    database and the load order names both."""
    import sqlite3

    from atlas_pipeline.d1 import apply_batch

    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    order = json.loads((out.directory / "regeneration.json").read_text())["load_order"]
    assert order["DB"] == ["prelude.sql", "stage.sql", "swap.sql"]
    assert order["DB_STATEMENTS"] == [
        "statements-prelude.sql",
        "statements-stage.sql",
        "statements-swap.sql",
    ]
    main = sqlite3.connect(":memory:")
    for name in ("prelude.sql", "stage.sql", "swap.sql"):
        apply_batch(main, (out.directory / name).read_text())
    assert main.execute("SELECT count(*) FROM businesses").fetchone() == (EXPECTED["entities"],)
    assert main.execute(
        "SELECT count(*) FROM sqlite_master WHERE name IN ('statements', 'refs')"
    ).fetchone() == (0,)
    second = sqlite3.connect(":memory:")
    for name in ("statements-prelude.sql", "statements-stage.sql", "statements-swap.sql"):
        apply_batch(second, (out.directory / name).read_text())
    assert second.execute("SELECT count(*) FROM statements").fetchone() == (EXPECTED["rows"] * 6,)
    assert second.execute("SELECT count(*) FROM refs").fetchone()[0] >= 1
    assert second.execute("SELECT value FROM meta WHERE key='live_regeneration'").fetchone() == (
        "20260829T210000Z",
    )
    assert second.execute(
        "SELECT count(*) FROM sqlite_master WHERE name = 'businesses'"
    ).fetchone() == (0,)


def test_regenerate_writes_candidates_and_aliases_for_review(tmp_path: Path):
    """Name candidates and aliases are outputs of every regeneration: parquet for the bundles
    and tables in the main serving database, never merges."""
    import sqlite3

    from atlas_pipeline.d1 import apply_batch

    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    candidates = pq.read_table(out.directory / "linkage_candidates.parquet")
    assert candidates.column_names == [
        "atlas_id_a",
        "atlas_id_b",
        "match_probability",
        "match_weight",
        "comparison",
        "blocking_rule",
        "model_version",
    ]
    aliases = pq.read_table(out.directory / "aliases.parquet")
    assert aliases.column_names == ["atlas_id", "canonical_atlas_id", "reason"]
    assert out.summary["counts"]["linkage_candidates"] == candidates.num_rows
    assert out.summary["counts"]["aliases"] == 0
    db = sqlite3.connect(":memory:")
    for name in ("prelude.sql", "stage.sql", "swap.sql"):
        apply_batch(db, (out.directory / name).read_text())
    tables = {n for (n,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"linkage_candidates", "aliases"} <= tables
    assert db.execute("SELECT count(*) FROM linkage_candidates").fetchone() == (
        candidates.num_rows,
    )


def test_regenerate_scores_all_four_rubrics_with_formality_first(tmp_path: Path):
    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    scores = pq.read_table(out.directory / "scores.parquet").to_pylist()
    by_rubric = {}
    for s in scores:
        by_rubric.setdefault(s["rubric"], []).append(s)
    assert set(by_rubric) == {
        "formality",
        "activity",
        "compliance_signals",
        "procurement_readiness",
    }
    assert all(len(v) == EXPECTED["entities"] for v in by_rubric.values())
    procurement = by_rubric["procurement_readiness"][0]
    formality_row = next(
        e for e in json.loads(procurement["evidence"]) if e["predicate"] == "formality_threshold"
    )
    assert formality_row["reason"].startswith("formality 25 of 100 below 55")
    businesses = pq.read_table(out.directory / "businesses.parquet").to_pylist()
    assert out.summary["counts"]["scores"] == EXPECTED["entities"] * 4
    assert businesses


def test_regenerate_puts_scores_in_a_third_database_and_shares_pack_coverage_once(tmp_path: Path):
    """Scores (four rubrics with evidence) are the largest table, so they load into DB_SCORES.
    The applicable and checked register lists are the same for every business in a
    regeneration, so they are stored once in meta and each business keeps only found_in."""
    import sqlite3

    from atlas_pipeline.d1 import apply_batch

    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    order = json.loads((out.directory / "regeneration.json").read_text())["load_order"]
    assert order["DB_SCORES"] == ["scores-prelude.sql", "scores-stage.sql", "scores-swap.sql"]
    main = sqlite3.connect(":memory:")
    for name in order["DB"]:
        apply_batch(main, (out.directory / name).read_text())
    assert main.execute("SELECT count(*) FROM sqlite_master WHERE name='scores'").fetchone() == (0,)
    coverage = json.loads(main.execute("SELECT coverage FROM businesses LIMIT 1").fetchone()[0])
    assert set(coverage) == {"found_in"}
    meta = dict(main.execute("SELECT key, value FROM meta").fetchall())
    assert json.loads(meta["coverage_applicable"])[0] == "kcca.businesses"
    assert json.loads(meta["coverage_checked"]) == ["kcca.businesses"]
    assert meta["live_regeneration"] == "20260829T210000Z"
    scores_db = sqlite3.connect(":memory:")
    for name in order["DB_SCORES"]:
        apply_batch(scores_db, (out.directory / name).read_text())
    assert scores_db.execute("SELECT count(*) FROM scores").fetchone() == (
        EXPECTED["entities"] * 4,
    )
    assert scores_db.execute("SELECT value FROM meta WHERE key='live_regeneration'").fetchone() == (
        "20260829T210000Z",
    )
