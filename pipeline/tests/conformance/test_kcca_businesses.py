"""Adapter conformance suite, run against the KCCA licensed businesses adapter on fixtures.

The six checks are the contract in docs/ARCHITECTURE.md section 6. Every adapter gets a copy
of this module with only ADAPTER, natures and the expected fixture changed.
"""

import json
from collections import Counter
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "kcca_businesses"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


def _slug(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-")


@pytest.fixture(scope="module")
def spec():
    return load_adapter(ADAPTER)


@pytest.fixture(scope="module")
def fetcher(spec):
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    return lambda url, **_request: pages[url]


def _run(spec, fetcher, root: Path, previous_manifest=None):
    return run_adapter(
        spec,
        data_root=root,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=fetcher,
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
        previous_manifest=previous_manifest,
    )


@pytest.fixture(scope="module")
def run(spec, fetcher, tmp_path_factory):
    return _run(spec, fetcher, tmp_path_factory.mktemp("run-a"))


def test_1_emits_both_parquet_files_and_a_valid_manifest(run):
    findings = check_run(ADAPTER, run.output_dir, checks=["outputs"])
    assert findings == []
    assert (run.output_dir / "records.parquet").exists()
    assert (run.output_dir / "statements.parquet").exists()
    assert run.manifest["rows"] == EXPECTED["rows"]
    assert run.manifest["rows_dropped"] == EXPECTED["rows_dropped"]


def test_2_every_statement_carries_provenance(run):
    assert check_run(ADAPTER, run.output_dir, checks=["provenance"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert statements, "no statements emitted"
    for s in statements:
        assert s["source_ref"].startswith("https://kcca.go.ug/")
        assert s["asserted_at"] == STARTED_AT
        assert s["licence"] == "public-record"
        assert s["precedence"] == 3
        assert s["country"] == "UG"


def test_3_excluded_columns_never_appear(run):
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []
    records = pq.read_table(run.output_dir / "records.parquet")
    statements = pq.read_table(run.output_dir / "statements.parquet")
    for col in ("contact", "email"):
        assert col not in records.column_names
        assert col not in statements.column_names
    assert "contact_hash" in records.column_names
    assert "256700000001" not in records.to_pandas().to_string()
    fields = set(statements.column("field").to_pylist())
    assert not {f for f in fields if "contact" in f or "email" in f}


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    ids = [json.loads(s["value"]) for s in statements if s["field"] == "identifiers"]
    assert len(ids) == EXPECTED["rows"], "one identifier statement per source record"
    assert len({i["value"] for i in ids}) == EXPECTED["entities"]
    assert {i["scheme"] for i in ids} == {"ug:kcca_licence"}
    assert len({s["statement_id"] for s in statements}) == len(statements)


def test_5_rerun_on_same_raw_input_is_byte_identical(spec, fetcher, run, tmp_path):
    again = _run(spec, fetcher, tmp_path / "run-b")
    assert (
        check_run(ADAPTER, run.output_dir, compare_to=again.output_dir, checks=["idempotent"]) == []
    )
    for name in ("records.parquet", "statements.parquet"):
        assert (run.output_dir / name).read_bytes() == (again.output_dir / name).read_bytes()


def test_6_row_count_outside_tolerance_flags_the_run(spec, fetcher, tmp_path):
    previous = {"rows": 1000}
    flagged = _run(spec, fetcher, tmp_path / "run-c", previous_manifest=previous)
    assert "row_count_out_of_tolerance" in flagged.manifest["flags"]
    assert check_run(ADAPTER, flagged.output_dir, checks=["tolerance"]) != []
    within = _run(spec, fetcher, tmp_path / "run-d", previous_manifest={"rows": EXPECTED["rows"]})
    assert within.manifest["flags"] == []


def test_records_and_statements_match_the_expected_fixture(run):
    records = pq.read_table(run.output_dir / "records.parquet").to_pylist()
    assert len(records) == EXPECTED["rows"]
    assert all(r["division"].endswith("Division") for r in records)
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    for name, fields in EXPECTED["statements_for"].items():
        entity_ids = {
            s["entity_id"]
            for s in statements
            if s["field"] == "canonical_name" and s["value"] == name
        }
        assert len(entity_ids) == 1, f"{name} should resolve to one entity"
        (entity_id,) = entity_ids
        by_field = Counter()
        values = {}
        for s in statements:
            if s["entity_id"] == entity_id:
                by_field[s["field"]] += 1
                values.setdefault(s["field"], []).append(s["value"])
        for field, expected in fields.items():
            if field == "support":
                continue
            got = sorted(set(values[field]))
            assert got == sorted(expected if isinstance(expected, list) else [expected]), field
    assert len({s["entity_id"] for s in statements}) == EXPECTED["entities"]
    raw_dir = run.raw_dir
    assert sorted(p.name for p in raw_dir.iterdir()) == ["bakery.html", "retailers.html"]


def test_replay_from_previous_raw_reproduces_outputs_without_fetching(spec, fetcher, run, tmp_path):
    from atlas_pipeline.adapters import replay_fetcher

    def refuse(url, **_request):
        raise AssertionError(f"network fetch attempted during replay: {url}")

    replay = run_adapter(
        spec,
        data_root=tmp_path / "replay",
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=refuse,
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
        replay_from=run.output_dir / "manifest.json",
    )
    for name in ("records.parquet", "statements.parquet"):
        assert (replay.output_dir / name).read_bytes() == (run.output_dir / name).read_bytes()
    assert all("url" in o for o in run.manifest["raw_objects"])
    assert replay_fetcher is not None


def test_same_value_from_two_listings_keeps_two_statements(run):
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    names = [
        s
        for s in statements
        if s["field"] == "canonical_name" and s["value"] == "EXAMPLE BAKERY LTD"
    ]
    assert (
        len(names) == EXPECTED["statements_for"]["EXAMPLE BAKERY LTD"]["support"]["canonical_name"]
    )
    assert len({s["source_record_id"] for s in names}) == 2
