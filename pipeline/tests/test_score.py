# SPDX-License-Identifier: Apache-2.0
"""Scoring v0: the Formality rubric as a pure function with evidence rows and coverage."""

import json
from pathlib import Path

import pytest

from atlas_pipeline.score import load_rubric, score

REPO = Path(__file__).resolve().parents[2]
GOLDEN = Path(__file__).parent / "golden" / "formality"
AT = "2026-08-29T10:00:00Z"


def load_case(name: str) -> dict:
    return json.loads((GOLDEN / f"{name}.json").read_text())


@pytest.fixture(scope="module")
def rubric():
    return load_rubric(
        REPO / "rubrics" / "formality" / "v1.yml",
        REPO / "packs" / "ug" / "rubrics" / "bindings.yml",
    )


@pytest.mark.parametrize("case", ["kcca_only", "kcca_and_tin", "not_found"])
def test_formality_matches_golden(rubric, case):
    data = load_case(case)
    assert (
        score(rubric, data["business"], data["statements"], evaluation_as_of=AT) == data["expected"]
    )


def test_score_is_pure_and_deterministic(rubric):
    data = load_case("kcca_and_tin")
    a = score(rubric, data["business"], data["statements"], evaluation_as_of=AT)
    b = score(rubric, data["business"], list(reversed(data["statements"])), evaluation_as_of=AT)
    assert a == b


def test_a_regulator_status_row_proves_presence_where_the_register_publishes_no_identifier():
    """Kenya's central bank directories list institutions without any licence number, so the
    pack binds the regulator predicate to the register's own licensed-status row."""
    rubric = load_rubric(
        REPO / "rubrics" / "formality" / "v1.yml",
        REPO / "packs" / "ke" / "rubrics" / "bindings.yml",
    )
    business = {
        "atlas_id": "atl_00000000000000ke",
        "identifiers": [],
        "coverage": {
            "applicable": ["cbk.licensed_banks"],
            "checked": ["cbk.licensed_banks"],
            "found_in": ["cbk.licensed_banks"],
            "not_yet_checked": [],
        },
    }
    statements = [
        {
            "statement_id": "k1",
            "field": "canonical_name",
            "value": "Example Bank Kenya PLC",
            "source": "cbk.licensed_banks",
            "asserted_at": "2026-08-30T00:00:00Z",
            "precedence": 3,
        },
        {
            "statement_id": "k2",
            "field": "status.cbk_licensed",
            "value": "licensed",
            "source": "cbk.licensed_banks",
            "asserted_at": "2026-08-30T00:00:00Z",
            "precedence": 3,
        },
    ]
    result = score(rubric, business, statements, evaluation_as_of=AT)
    assert (result["value"], result["checkable"], result["unknown"]) == (15, 15, 85)
    regulator = next(e for e in result["evidence"] if e["predicate"] == "sector_regulator_licence")
    assert regulator["points"] == 15
    assert regulator["statement_ids"] == ["k2"]
