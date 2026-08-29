"""Tests written from the adversarial review of the 2a pipeline diff."""

import json
import sqlite3

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.d1 import (
    STATEMENT_LIMIT,
    apply_batch,
    insert_statements,
    regeneration_sql,
    swap_sql,
)
from atlas_pipeline.regenerate import regenerate
from atlas_pipeline.score import load_rubric, score

from .conftest import PACKS, RUN_ID, SALT, STARTED_AT

REPO = PACKS.parent
ADAPTER = PACKS / "ug" / "sources" / "kcca_businesses"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())
SCHEMA = REPO / "infra" / "d1" / "schema.sql"


def _slug(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-")


def _fixture_fetcher(spec):
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    return lambda url, **_request: pages[url]


def _run(spec, root, **kw):
    return run_adapter(
        spec,
        data_root=root,
        run_id=kw.pop("run_id", RUN_ID),
        started_at=kw.pop("started_at", STARTED_AT),
        fetcher=kw.pop("fetcher", _fixture_fetcher(spec)),
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
        **kw,
    )


def _regen(root, rid="20260829T210000Z"):
    return regenerate(
        pack_dir=PACKS / "ug",
        data_root=root,
        regeneration_id=rid,
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=REPO / "rubrics",
        schema_path=SCHEMA,
    )


# Finding 1 and 3: run outputs are immutable per run; only accepted runs are published.
def test_run_outputs_live_under_run_id_and_accepted_pointer_moves_only_on_clean_runs(tmp_path):
    spec = load_adapter(ADAPTER)
    ok = _run(spec, tmp_path)
    assert ok.output_dir.name == RUN_ID and ok.output_dir.parent.name == "runs"
    pointer = ok.output_dir.parents[1] / "accepted.json"
    assert json.loads(pointer.read_text())["run_id"] == RUN_ID
    flagged = _run(spec, tmp_path, run_id="20260830T000000Z", previous_manifest={"rows": 1000})
    assert flagged.manifest["flags"]
    assert json.loads(pointer.read_text())["run_id"] == RUN_ID, "flagged run must not be accepted"


def test_regenerate_uses_accepted_run_and_refuses_empty_output(tmp_path):
    spec = load_adapter(ADAPTER)
    _run(spec, tmp_path)
    _run(spec, tmp_path, run_id="20260830T000000Z", previous_manifest={"rows": 1000})
    out = _regen(tmp_path)
    assert out.summary["inputs"] == {"kcca.businesses": RUN_ID}
    with pytest.raises(RuntimeError, match="no accepted run"):
        _regen(tmp_path / "empty")


def test_regenerate_verifies_checksums_before_loading(tmp_path):
    spec = load_adapter(ADAPTER)
    run = _run(spec, tmp_path)
    (run.output_dir / "statements.parquet").write_bytes(b"corrupt")
    with pytest.raises(RuntimeError, match="checksum"):
        _regen(tmp_path)


# Finding 4: exported keys must not derive from contact data.
def test_entity_and_record_keys_do_not_depend_on_contact_or_salt(tmp_path):
    spec = load_adapter(ADAPTER)
    a = run_adapter(
        spec, data_root=tmp_path / "a", run_id=RUN_ID, started_at=STARTED_AT,
        fetcher=_fixture_fetcher(spec), salt="salt-one", params={"natures": EXPECTED["natures"]},
    )  # fmt: skip
    b = run_adapter(
        spec, data_root=tmp_path / "b", run_id=RUN_ID, started_at=STARTED_AT,
        fetcher=_fixture_fetcher(spec), salt="salt-two", params={"natures": EXPECTED["natures"]},
    )  # fmt: skip
    sa = pq.read_table(a.output_dir / "statements.parquet").to_pylist()
    sb = pq.read_table(b.output_dir / "statements.parquet").to_pylist()
    assert {s["entity_id"] for s in sa} == {s["entity_id"] for s in sb}
    assert {s["source_record_id"] for s in sa} == {s["source_record_id"] for s in sb}
    assert {s["statement_id"] for s in sa} == {s["statement_id"] for s in sb}
    ra = pq.read_table(a.output_dir / "records.parquet").to_pylist()
    rb = pq.read_table(b.output_dir / "records.parquet").to_pylist()
    assert {r["contact_hash"] for r in ra} != {r["contact_hash"] for r in rb}
    for column in spec.mapping["record_id"]["columns"] + spec.mapping["entity_id"]["columns"]:
        assert "contact" not in column and "email" not in column


# Finding 5: a listed source's non-TIN identifier must not earn tax-identity points.
def test_tax_identity_requires_the_scheme_not_just_the_source():
    rubric = load_rubric(
        REPO / "rubrics" / "formality" / "v1.yml", PACKS / "ug" / "rubrics" / "bindings.yml"
    )
    business = {
        "coverage": {
            "applicable": ["kcca.businesses", "ura.customs_agents"],
            "checked": ["kcca.businesses", "ura.customs_agents"],
            "found_in": ["ura.customs_agents"],
        }
    }
    statements = [
        {
            "statement_id": "s9",
            "field": "identifiers",
            "value": '{"scheme":"ug:customs_licence","value":"CA-1"}',
            "source": "ura.customs_agents",
            "asserted_at": "2026-08-12T00:00:00Z",
            "precedence": 2,
        }
    ]
    result = score(rubric, business, statements, evaluation_as_of="2026-08-29T10:00:00Z")
    tax = next(e for e in result["evidence"] if e["predicate"] == "tax_identity_present")
    assert tax["points"] == 0 and tax["reason"] == "no evidence in checked registers"


# Finding 6: serving statements keep country.
def test_serving_statements_keep_country(tmp_path):
    spec = load_adapter(ADAPTER)
    _run(spec, tmp_path)
    out = _regen(tmp_path)
    db = sqlite3.connect(":memory:")
    apply_batch(db, (out.directory / "statements-stage.sql").read_text().splitlines())
    apply_batch(db, (out.directory / "statements-swap.sql").read_text().splitlines())
    assert db.execute("SELECT DISTINCT country FROM statements").fetchall() == [("UG",)]


# Finding 7: a single oversized row fails loudly instead of emitting an over-limit statement.
def test_single_oversized_row_is_rejected():
    with pytest.raises(ValueError, match="exceeds"):
        insert_statements("t", ["a"], [{"a": "x" * (STATEMENT_LIMIT + 1)}])
    stmts = insert_statements("t", ["a"], [{"a": "x" * 50_000}, {"a": "y" * 50_000}])
    assert len(stmts) == 2 and all(len(s.encode()) <= STATEMENT_LIMIT for s in stmts)


# Finding 8: replay reproduces the original assertion time without injection.
def test_replay_without_started_at_reuses_the_original_run_time(tmp_path):
    spec = load_adapter(ADAPTER)
    run = _run(spec, tmp_path)
    replay = run_adapter(
        spec,
        data_root=tmp_path / "replay",
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
        replay_from=run.output_dir / "manifest.json",
    )
    assert replay.manifest["started_at"] == run.manifest["started_at"]
    for name in ("records.parquet", "statements.parquet"):
        assert (replay.output_dir / name).read_bytes() == (run.output_dir / name).read_bytes()


# Finding 9: regeneration ids are validated before they reach SQL identifiers.
@pytest.mark.parametrize("bad", ["release-1", "x; DROP TABLE businesses", "", "a b"])
def test_regeneration_id_must_be_identifier_safe(bad):
    regeneration = {
        "id": bad,
        "started_at": "2026-08-29T21:00:00Z",
        "finished_at": "2026-08-29T21:00:00Z",
        "inputs": {},
    }
    with pytest.raises(ValueError, match="regeneration id"):
        regeneration_sql(SCHEMA, regeneration, [], [], [], [])
    with pytest.raises(ValueError, match="regeneration id"):
        swap_sql(SCHEMA, regeneration)


# Finding 2: the swap is applied as one transaction; a mid-swap failure leaves live tables intact.
def test_swap_failure_leaves_previous_regeneration_live(tmp_path):
    spec = load_adapter(ADAPTER)
    _run(spec, tmp_path)
    out = _regen(tmp_path)
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA.read_text())
    db.execute("INSERT INTO meta VALUES ('live_regeneration', 'previous')")
    db.execute(
        "INSERT INTO businesses VALUES ('atl_previous00000000','UG','OLD','OLD','[]','unknown',"
        "NULL,NULL,NULL,NULL,'2026-01-01','2026-01-01','{}','{}')"
    )
    apply_batch(db, (out.directory / "stage.sql").read_text().splitlines())
    swap = (out.directory / "swap.sql").read_text().splitlines()
    broken = (
        swap[: len(swap) // 2]
        + ["SELECT * FROM table_that_does_not_exist;"]
        + swap[len(swap) // 2 :]
    )
    with pytest.raises(sqlite3.OperationalError):
        apply_batch(db, broken)
    assert db.execute("SELECT value FROM meta WHERE key='live_regeneration'").fetchone() == (
        "previous",
    )
    assert db.execute("SELECT count(*) FROM businesses").fetchone() == (1,)
    apply_batch(db, swap)
    assert db.execute("SELECT count(*) FROM businesses").fetchone() == (EXPECTED["entities"],)
