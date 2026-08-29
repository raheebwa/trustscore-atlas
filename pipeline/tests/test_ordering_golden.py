"""The shared precedence-ordering goldens (schemas/golden/precedence-ordering.json) must hold
for the pipeline's rank_values exactly as they hold for the site's ordering module."""

import json
from pathlib import Path

import pytest

from atlas_pipeline.resolve import rank_values

GOLDEN = json.loads(
    (
        Path(__file__).resolve().parents[2] / "schemas" / "golden" / "precedence-ordering.json"
    ).read_text()
)


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=[c["name"] for c in GOLDEN["cases"]])
def test_shared_ordering_golden(case):
    statements = [{**s, "entity_id": "e", "field": "canonical_name"} for s in case["statements"]]
    assert rank_values(statements) == case["ranked"]
