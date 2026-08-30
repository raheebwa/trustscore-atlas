# SPDX-License-Identifier: Apache-2.0
"""Conformance checks for the UNBS certified products register."""

import json
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "unbs_certified_products"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


@pytest.fixture(scope="module")
def spec():
    return load_adapter(ADAPTER)


@pytest.fixture(scope="module")
def fetcher(spec):
    page = (ADAPTER / "fixtures" / "raw" / "certified-products.html").read_bytes()

    def fetch(url, **_request):
        assert url == spec.module.ENDPOINT
        return page

    return fetch


def _run(spec, fetcher, root: Path, previous_manifest=None):
    return run_adapter(
        spec,
        data_root=root,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=fetcher,
        salt=SALT,
        previous_manifest=previous_manifest,
    )


@pytest.fixture(scope="module")
def run(spec, fetcher, tmp_path_factory):
    return _run(spec, fetcher, tmp_path_factory.mktemp("unbs-run"))


def test_1_emits_both_parquet_files_and_a_valid_manifest(run):
    assert check_run(ADAPTER, run.output_dir, checks=["outputs"]) == []
    assert run.manifest["rows"] == EXPECTED["rows"]
    assert run.manifest["rows_dropped"] == EXPECTED["rows_dropped"]


def test_2_every_statement_carries_provenance(run):
    assert check_run(ADAPTER, run.output_dir, checks=["provenance"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert statements
    assert {s["source_ref"] for s in statements} == {
        "https://cims.unbs.go.ug/api/website/?per_page=20000"
    }
    assert {s["licence"] for s in statements} == {"public-record"}
    assert {s["precedence"] for s in statements} == {3}
    assert {s["country"] for s in statements} == {"UG"}


def test_3_excluded_columns_never_appear(spec, run):
    assert spec.source["pii"] == {"excluded_columns": [], "hashed_columns": []}
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [json.loads(s["value"]) for s in statements if s["field"] == "identifiers"]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert {item["scheme"] for item in identifiers} == {"ug:unbs_permit"}


def test_5_rerun_on_same_raw_input_is_byte_identical(spec, fetcher, run, tmp_path):
    again = _run(spec, fetcher, tmp_path / "again")
    assert (
        check_run(ADAPTER, run.output_dir, compare_to=again.output_dir, checks=["idempotent"]) == []
    )


def test_6_row_count_outside_tolerance_flags_the_run(spec, fetcher, tmp_path):
    flagged = _run(spec, fetcher, tmp_path / "flagged", previous_manifest={"rows": 1000})
    assert check_run(ADAPTER, flagged.output_dir, checks=["tolerance"])
    within = _run(
        spec,
        fetcher,
        tmp_path / "within",
        previous_manifest={"rows": EXPECTED["rows"]},
    )
    assert within.manifest["flags"] == []


def test_records_and_statements_match_the_expected_fixture(run):
    records = pq.read_table(run.output_dir / "records.parquet").to_pylist()
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    assert len(records) == EXPECTED["rows"]
    assert len({s["entity_id"] for s in statements}) == EXPECTED["entities"]
    entity_ids = {
        s["entity_id"]
        for s in statements
        if s["field"] == "canonical_name" and s["value"] == EXPECTED["company"]
    }
    assert len(entity_ids) == 1
    (entity_id,) = entity_ids
    values = {}
    for statement in statements:
        if statement["entity_id"] == entity_id:
            values.setdefault(statement["field"], set()).add(statement["value"])
    for field, expected in EXPECTED["statements_for_company"].items():
        assert values[field] == set(expected)
    assert sorted(path.name for path in run.raw_dir.iterdir()) == EXPECTED["raw_files"]


def test_endpoint_and_certificate_bundle_match_the_reference(spec):
    assert spec.module.ENDPOINT.endswith("?per_page=20000")
    assert spec.module.TLS_VERIFY
