"""Conformance checks for the PPDA OCDS party and procurement adapter."""

import json
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "ppda_ocds"
FIXTURES = ADAPTER / "fixtures" / "raw"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


class FixtureFetcher:
    """Resolve each request method, URL, and POST body to a local response."""

    def __init__(self, module):
        self.module = module
        self.calls = []
        self.status_calls = defaultdict(int)

    def __call__(self, url, *, method="GET", data=None, headers=None):
        self.calls.append({"url": url, "method": method, "data": data, "headers": headers})

        # GET /available-years maps to available-years.json.
        if (method, url) == ("GET", self.module.available_years_url()):
            return (FIXTURES / "available-years.json").read_bytes()

        # POST /exports uses its JSON body to select exports-<fy>.json.
        if (method, url) == ("POST", self.module.exports_url()):
            request = json.loads(data)
            return (FIXTURES / f"exports-{request['fy']}.json").read_bytes()

        for year in EXPECTED["years"]:
            job_id = f"fixture-job-{year}"
            status_url = self.module.status_url(job_id)
            download_url = self.module.download_url(job_id)

            # GET /status maps to one file, or a pending and complete sequence.
            if (method, url) == ("GET", status_url):
                self.status_calls[year] += 1
                suffix = ""
                if year == "2025-2026":
                    suffix = "-pending" if self.status_calls[year] == 1 else "-complete"
                return (FIXTURES / f"status-{year}{suffix}.json").read_bytes()

            # GET /download maps to download-<fy>.json.
            if (method, url) == ("GET", download_url):
                return (FIXTURES / f"download-{year}.json").read_bytes()

        raise KeyError((method, url))


@pytest.fixture(scope="module")
def spec():
    return load_adapter(ADAPTER)


def _run(spec, root: Path, previous_manifest=None, params=None):
    fetcher = FixtureFetcher(spec.module)
    result = run_adapter(
        spec,
        data_root=root,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=fetcher,
        salt=SALT,
        params=params,
        previous_manifest=previous_manifest,
    )
    return result, fetcher


@pytest.fixture(scope="module")
def run_case(spec, tmp_path_factory):
    return _run(spec, tmp_path_factory.mktemp("ppda-ocds-run"))


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
    assert all(s["source_ref"].startswith("https://cdn.ppda.go.ug/") for s in statements)
    assert all(s["asserted_at"] == STARTED_AT for s in statements)
    assert {s["licence"] for s in statements} == {"CC-BY-4.0"}
    assert {s["precedence"] for s in statements} == {3}
    assert {s["country"] for s in statements} == {"UG"}


def test_3_excluded_columns_and_contact_values_never_appear(spec, run):
    assert spec.source["pii"] == {
        "excluded_columns": ["contact_name", "telephone", "email"],
        "hashed_columns": [],
    }
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []
    raw = (FIXTURES / "download-2025-2026.json").read_text()
    assert "contactPoint" in raw
    output = "\n".join(
        pq.read_table(run.output_dir / name).to_pandas().to_string()
        for name in ("records.parquet", "statements.parquet")
    )
    for value in ("Example Contact Person", "+256700000000", "contact@example.invalid"):
        assert value not in output


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [json.loads(s["value"]) for s in statements if s["field"] == "identifiers"]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert len({item["value"] for item in identifiers}) == EXPECTED["entities"]
    assert {item["scheme"] for item in identifiers} == {"ug:ppda_party_id"}


def test_5_rerun_on_same_raw_input_is_byte_identical(spec, run, tmp_path):
    again, _ = _run(spec, tmp_path / "again")
    assert (
        check_run(ADAPTER, run.output_dir, compare_to=again.output_dir, checks=["idempotent"])
        == []
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
    assert len({s["entity_id"] for s in statements}) == EXPECTED["entities"]

    company_record = next(r for r in records if r["name"] == EXPECTED["company"])
    for field, expected in EXPECTED["company_record"].items():
        assert company_record[field] == expected

    entity_ids = {
        s["entity_id"]
        for s in statements
        if s["field"] == "canonical_name" and s["value"] == EXPECTED["company"]
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


def test_export_requests_match_the_reference_flow(run_case):
    _, fetcher = run_case
    calls = fetcher.calls
    assert calls[0] == {
        "url": fetcher.module.available_years_url(),
        "method": "GET",
        "data": None,
        "headers": None,
    }
    posts = [call for call in calls if call["method"] == "POST"]
    assert [json.loads(call["data"]) for call in posts] == [
        {"fy": year, "format": "json"} for year in EXPECTED["years"]
    ]
    assert all(call["url"] == fetcher.module.exports_url() for call in posts)
    assert all(call["headers"] == {"Content-Type": "application/json"} for call in posts)
    assert all(isinstance(call["data"], bytes) for call in posts)

    get_urls = [call["url"] for call in calls if call["method"] == "GET"]
    for year in EXPECTED["years"]:
        job_id = f"fixture-job-{year}"
        assert fetcher.module.status_url(job_id) in get_urls
        assert fetcher.module.download_url(job_id) in get_urls
    assert fetcher.status_calls["2025-2026"] == 2


def test_year_params_restrict_export_requests(spec, tmp_path):
    selected = ["2026-2027"]
    result, fetcher = _run(spec, tmp_path / "selected", params={"years": selected})
    posts = [call for call in fetcher.calls if call["method"] == "POST"]
    assert [json.loads(call["data"])["fy"] for call in posts] == selected
    assert sorted(path.name for path in result.raw_dir.iterdir()) == ["ppda-2026-2027.json"]
