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
