# SPDX-License-Identifier: Apache-2.0
"""Conformance checks for the Bank of Uganda supervised institutions register."""

import json
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.conformance import check_run

from ..conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "bou_supervised_institutions"
FIXTURES = ADAPTER / "fixtures" / "raw"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


class FixtureFetcher:
    def __init__(self, module):
        self.module = module
        self.calls = []

    def __call__(self, url, *, method="GET", data=None, headers=None):
        self.calls.append({"url": url, "method": method, "data": data, "headers": headers})
        if (method, url) == ("GET", self.module.ENDPOINT):
            return (FIXTURES / "supervision.json").read_bytes()
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
    return _run(spec, tmp_path_factory.mktemp("bou-supervised-run"))


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
        "https://bou.or.ug/api/supervision"
        "?populate[supervisedInstitutions][populate][category][populate]=*"
    }
    assert {statement["licence"] for statement in statements} == {"public-record"}
    assert {statement["precedence"] for statement in statements} == {3}
    assert {statement["country"] for statement in statements} == {"UG"}


def test_3_excluded_columns_and_values_never_appear(spec, run):
    assert spec.source["pii"] == {
        "excluded_columns": ["phone", "email", "address"],
        "hashed_columns": [],
    }
    assert check_run(ADAPTER, run.output_dir, checks=["exclusions"]) == []
    raw = (FIXTURES / "supervision.json").read_text()
    for key in ("phoneNumber", "email", "address"):
        assert key in raw
    output = "\n".join(
        pq.read_table(run.output_dir / name).to_pandas().to_string()
        for name in ("records.parquet", "statements.parquet")
    )
    for value in (
        "+256 700 000 001",
        "registry@example.invalid",
        "Example House, Sample Road",
    ):
        assert value not in output


def test_4_identifier_values_match_pack_patterns(run):
    assert check_run(ADAPTER, run.output_dir, checks=["identifiers"]) == []
    statements = pq.read_table(run.output_dir / "statements.parquet").to_pylist()
    identifiers = [
        json.loads(statement["value"])
        for statement in statements
        if statement["field"] == "identifiers"
    ]
    assert len(identifiers) == EXPECTED["identifier_statements"]
    assert {item["scheme"] for item in identifiers} == {"ug:bou_code"}


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

    institution = next(record for record in records if record["name"] == EXPECTED["institution"])
    for field, expected in EXPECTED["institution_record"].items():
        assert institution[field] == expected

    entity_ids = {
        statement["entity_id"]
        for statement in statements
        if statement["field"] == "canonical_name" and statement["value"] == EXPECTED["institution"]
    }
    assert len(entity_ids) == 1
    (entity_id,) = entity_ids
    values = defaultdict(set)
    for statement in statements:
        if statement["entity_id"] == entity_id:
            values[statement["field"]].add(statement["value"])
    for field, expected in EXPECTED["statements_for_institution"].items():
        assert values[field] == set(expected)
    assert sorted(path.name for path in run.raw_dir.iterdir()) == EXPECTED["raw_files"]


def test_request_matches_the_reference_flow(run_case):
    _, fetcher = run_case
    assert fetcher.calls == [
        {
            "url": fetcher.module.ENDPOINT,
            "method": "GET",
            "data": None,
            "headers": {"Accept": "application/json"},
        }
    ]
