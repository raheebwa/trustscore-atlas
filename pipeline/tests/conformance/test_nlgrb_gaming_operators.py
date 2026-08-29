"""Conformance checks for the NLGRB gaming operators register."""

import json
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "nlgrb_gaming_operators"
FIXTURES = ADAPTER / "fixtures" / "raw"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


class FixtureFetcher:
    def __init__(self, module):
        self.module = module
        self.calls = []

    def __call__(self, url, *, method="GET", data=None, headers=None):
        self.calls.append({"url": url, "method": method, "data": data, "headers": headers})
        if (method, url) == ("GET", self.module.WPDM_SEARCH):
            return (FIXTURES / "wpdm-search.json").read_bytes()
        expected_download = self.module.download_url(
            "list-of-licensed-companies-for-year-2026", 412
        )
        if (method, url) == ("GET", expected_download):
            return (FIXTURES / "licensed-companies-2026.pdf").read_bytes()
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
    return _run(spec, tmp_path_factory.mktemp("nlgrb-operators-run"))


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
    expected_ref = "https://lgrb.go.ug/download/"
    assert all(statement["source_ref"].startswith(expected_ref) for statement in statements)
    assert {statement["licence"] for statement in statements} == {"public-record"}
    assert {statement["precedence"] for statement in statements} == {3}
    assert {statement["country"] for statement in statements} == {"UG"}


def test_3_source_has_no_excluded_columns(spec, run):
    assert spec.source["pii"] == {"excluded_columns": [], "hashed_columns": []}
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [
        json.loads(statement["value"])
        for statement in statements
        if statement["field"] == "identifiers"
    ]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert {item["scheme"] for item in identifiers} == {"ug:nlgrb_licence"}


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

    company_records = [
        record for record in records if record["company_name"] == EXPECTED["company"]
    ]
    assert len(company_records) == 2
    for expected_record in EXPECTED["company_records"]:
        assert any(
            all(record[field] == value for field, value in expected_record.items())
            and record["year"] == EXPECTED["year"]
            for record in company_records
        )

    entity_ids = {
        statement["entity_id"]
        for statement in statements
        if statement["field"] == "canonical_name" and statement["value"] == EXPECTED["company"]
    }
    assert len(entity_ids) == 1
    (entity_id,) = entity_ids
    values = defaultdict(set)
    for statement in statements:
        if statement["entity_id"] == entity_id:
            values[statement["field"]].add(statement["value"])
    for field, expected in EXPECTED["statements_for_company"].items():
        assert values[field] == set(expected)
    assert sorted(path.name for path in run.raw_dir.iterdir()) == EXPECTED["raw_files"]


def test_search_and_download_requests_match_the_reference_flow(run_case):
    _, fetcher = run_case
    assert fetcher.calls == [
        {
            "url": fetcher.module.WPDM_SEARCH,
            "method": "GET",
            "data": None,
            "headers": {"Accept": "*/*"},
        },
        {
            "url": fetcher.module.download_url("list-of-licensed-companies-for-year-2026", 412),
            "method": "GET",
            "data": None,
            "headers": {"Accept": "*/*"},
        },
    ]


def test_pdf_fixture_is_a_two_page_vector_table():
    """The hand-written PDF uses table lines and covers page-by-page extraction."""
    pdf = (FIXTURES / "licensed-companies-2026.pdf").read_bytes()
    assert pdf.startswith(b"%PDF-1.4")
    assert b"/Count 2" in pdf
