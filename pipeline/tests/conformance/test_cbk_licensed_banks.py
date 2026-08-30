"""Conformance checks for the Central Bank of Kenya licensed bank directories."""

import json
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ke" / "sources" / "cbk_licensed_banks"
FIXTURES = ADAPTER / "fixtures" / "raw"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


class FixtureFetcher:
    def __init__(self, module):
        self.module = module
        self.calls = []

    def __call__(self, url, *, method="GET", data=None, headers=None):
        self.calls.append({"url": url, "method": method, "data": data, "headers": headers})
        if (method, url) == ("GET", self.module.COMMERCIAL_URL):
            return (FIXTURES / "commercial-banks.html").read_bytes()
        if (method, url) == ("GET", self.module.MICROFINANCE_URL):
            return (FIXTURES / "microfinance-banks.html").read_bytes()
        raise KeyError((method, url))


@pytest.fixture(scope="module")
def spec():
    return load_adapter(ADAPTER)


def _run(spec, root: Path, previous_manifest=None):
    fetcher = FixtureFetcher(spec.module)
    result = run_adapter(
        spec,
        data_root=root,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=fetcher,
        salt=SALT,
        previous_manifest=previous_manifest,
    )
    return result, fetcher


@pytest.fixture(scope="module")
def run_case(spec, tmp_path_factory):
    return _run(spec, tmp_path_factory.mktemp("cbk-banks-run"))


@pytest.fixture(scope="module")
def run(run_case):
    return run_case[0]


def test_1_emits_both_parquet_files_and_a_valid_manifest(run):
    assert check_run(ADAPTER, run.output_dir, checks=["outputs"]) == []
    assert run.manifest["rows"] == EXPECTED["rows"]
    assert run.manifest["rows_dropped"] == EXPECTED["rows_dropped"]


def test_2_every_statement_carries_provenance(run):
    assert check_run(ADAPTER, run.output_dir, checks=["provenance"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert statements
    assert {statement["source_ref"] for statement in statements} == {
        run.manifest["raw_objects"][0]["url"],
        run.manifest["raw_objects"][1]["url"],
    }
    assert {statement["licence"] for statement in statements} == {"public-record"}
    assert {statement["precedence"] for statement in statements} == {3}
    assert {statement["country"] for statement in statements} == {"KE"}


def test_3_excluded_columns_never_appear(spec, run):
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []
    excluded = set(spec.source["pii"]["excluded_columns"]) | set(
        spec.source["pii"]["hashed_columns"]
    )
    for name in ("records.parquet", "statements.parquet"):
        assert not excluded & set(pq.read_schema(run.output_dir / name).names)


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [
        json.loads(statement["value"])
        for statement in statements
        if statement["field"] == "identifiers"
    ]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert {item["scheme"] for item in identifiers} == {"ke:cbk_licence"}


def test_5_rerun_on_same_raw_input_is_byte_identical(spec, run, tmp_path):
    again, _ = _run(spec, tmp_path / "again")
    assert (
        check_run(ADAPTER, run.output_dir, compare_to=again.output_dir, checks=["idempotent"]) == []
    )


def test_6_row_count_outside_tolerance_flags_the_run(spec, tmp_path):
    flagged, _ = _run(spec, tmp_path / "flagged", previous_manifest={"rows": 1000})
    assert check_run(ADAPTER, flagged.output_dir, checks=["tolerance"])
    within, _ = _run(
        spec,
        tmp_path / "within",
        previous_manifest={"rows": EXPECTED["rows"]},
    )
    assert within.manifest["flags"] == []


def test_records_and_statements_match_the_expected_fixture(run):
    records = pq.read_table(run.output_dir / "records.parquet").to_pylist()
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert len(records) == EXPECTED["rows"]
    assert len({statement["entity_id"] for statement in statements}) == EXPECTED["entities"]
    commercial = [r for r in records if r["category"] == "commercial_bank"]
    microfinance = [r for r in records if r["category"] == "microfinance_bank"]
    assert len(commercial) == EXPECTED["commercial_bank_rows"]
    assert len(microfinance) == EXPECTED["microfinance_bank_rows"]
    assert EXPECTED["commercial_bank"] in {r["name"] for r in commercial}
    assert EXPECTED["microfinance_bank"] in {r["name"] for r in microfinance}
    assert {s["value"] for s in statements if s["field"] == "status.cbk_licensed"} == {"licensed"}
    assert sorted(path.name for path in run.raw_dir.iterdir()) == EXPECTED["raw_files"]


def test_both_directories_are_fetched_once(run_case):
    _, fetcher = run_case
    urls = [call["url"] for call in fetcher.calls]
    assert urls == [fetcher.module.COMMERCIAL_URL, fetcher.module.MICROFINANCE_URL]
