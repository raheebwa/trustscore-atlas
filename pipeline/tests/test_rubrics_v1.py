# SPDX-License-Identifier: Apache-2.0
"""Typed rubric evaluators for Activity, Compliance Signals and Procurement Readiness, with
adverse golden cases: an expired licence, a suspended status, a cancelled award."""

import json
from pathlib import Path

import pytest

from atlas_pipeline.score import load_rubric, score

REPO = Path(__file__).resolve().parents[2]
GOLDEN = Path(__file__).parent / "golden"
AS_OF = "2026-08-29T21:00:00Z"


def cases(rubric: str):
    return sorted(p.stem for p in (GOLDEN / rubric).glob("*.json"))


@pytest.mark.parametrize("case", cases("activity"))
def test_activity_golden(case):
    _check("activity", case)


@pytest.mark.parametrize("case", cases("compliance_signals"))
def test_compliance_signals_golden(case):
    _check("compliance_signals", case)


@pytest.mark.parametrize("case", cases("procurement_readiness"))
def test_procurement_readiness_golden(case):
    _check("procurement_readiness", case)


def _check(rubric_name: str, case: str):
    rubric = load_rubric(
        REPO / "rubrics" / rubric_name / "v1.yml",
        REPO / "packs" / "ug" / "rubrics" / "bindings.yml",
    )
    data = json.loads((GOLDEN / rubric_name / f"{case}.json").read_text())
    result = score(rubric, data["business"], data["statements"], evaluation_as_of=AS_OF)
    assert result == data["expected"], case
