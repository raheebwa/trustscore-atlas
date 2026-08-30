# SPDX-License-Identifier: Apache-2.0
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
COMMERCIAL_PDF_URL = (
    "https://www.centralbank.go.ke/wp-content/uploads/2026/07/"
    "Directory-of-Licenced-Commercial-Banks-Mortgage-Finance-Institutions-and-"
    "Authorised-Non-Operating-Bank-Holding-Companies.pdf"
)
MICROFINANCE_PDF_URL = (
    "https://www.centralbank.go.ke/wp-content/uploads/2026/02/"
    "Directory-of-Licenced-Microfinance-Banks-Feb-2026.pdf"
)
OLDER_MICROFINANCE_PDF_URL = (
    "https://www.centralbank.go.ke/wp-content/uploads/2025/11/"
    "Directory-of-Licenced-Microfinance-Banks-Nov-2025.pdf"
)
CONTACT_FIELDS = {"postal_address", "telephone", "fax", "email", "physical_address"}


class FixtureFetcher:
    def __init__(self, module):
        self.module = module
        self.calls = []

    def __call__(self, url, *, method="GET", data=None, headers=None):
        self.calls.append({"url": url, "method": method, "data": data, "headers": headers})
        if (method, url) == ("GET", self.module.BANK_SUPERVISION_URL):
            return (FIXTURES / "bank-supervision.html").read_bytes()
        if (method, url) == ("GET", COMMERCIAL_PDF_URL):
            return (FIXTURES / "commercial-banks.pdf").read_bytes()
        if (method, url) == ("GET", MICROFINANCE_PDF_URL):
            return (FIXTURES / "microfinance-banks.pdf").read_bytes()
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


def test_2_every_statement_carries_provenance(spec, run):
    assert check_run(ADAPTER, run.output_dir, checks=["provenance"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert statements
    assert {statement["source_ref"] for statement in statements} == {
        COMMERCIAL_PDF_URL,
        MICROFINANCE_PDF_URL,
    }
    raw_urls = {item["name"]: item["url"] for item in run.manifest["raw_objects"]}
    assert raw_urls == {
        "bank-supervision.html": spec.module.BANK_SUPERVISION_URL,
        "commercial-banks.pdf": COMMERCIAL_PDF_URL,
        "microfinance-banks.pdf": MICROFINANCE_PDF_URL,
    }
    assert {statement["licence"] for statement in statements} == {"public-record"}
    assert {statement["precedence"] for statement in statements} == {3}
    assert {statement["country"] for statement in statements} == {"KE"}


def test_3_excluded_columns_never_appear(spec, run):
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []
    excluded = set(spec.source["pii"]["excluded_columns"]) | set(
        spec.source["pii"]["hashed_columns"]
    )
    assert excluded == CONTACT_FIELDS
    for name in ("records.parquet", "statements.parquet"):
        assert not excluded & set(pq.read_schema(run.output_dir / name).names)
    records = pq.read_table(run.output_dir / "records.parquet").to_pylist()
    assert all(not CONTACT_FIELDS & set(record) for record in records)


def test_4_identifier_values_match_pack_patterns(spec, run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [statement for statement in statements if statement["field"] == "identifiers"]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert spec.source["identifier_schemes"] == []
    assert spec.pack["identifier_schemes"] == {}


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
    by_category = {
        category: [record for record in records if record["category"] == category]
        for category in {
            "commercial_bank",
            "mortgage_finance_institution",
            "bank_holding_company",
            "microfinance_bank",
        }
    }
    for category, rows in by_category.items():
        assert len(rows) == EXPECTED[f"{category}_rows"]
        assert EXPECTED[category] in {row["name"] for row in rows}
    assert {row["directory_edition"] for row in by_category["commercial_bank"]} == {"2026/07"}
    assert {row["directory_edition"] for row in by_category["microfinance_bank"]} == {"2026/02"}
    example = next(record for record in records if record["name"] == EXPECTED["commercial_bank"])
    assert example["website"] == "https://www.examplebank.example.invalid/corporate"
    assert {s["value"] for s in statements if s["field"] == "status.cbk_licensed"} == {"licensed"}
    assert sorted(path.name for path in run.raw_dir.iterdir()) == EXPECTED["raw_files"]


def test_both_directories_are_fetched_once(run_case):
    _, fetcher = run_case
    urls = [call["url"] for call in fetcher.calls]
    assert urls == [fetcher.module.BANK_SUPERVISION_URL, COMMERCIAL_PDF_URL, MICROFINANCE_PDF_URL]
    assert urls.count(COMMERCIAL_PDF_URL) == 1
    assert urls.count(MICROFINANCE_PDF_URL) == 1
    assert OLDER_MICROFINANCE_PDF_URL not in urls
