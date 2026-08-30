# SPDX-License-Identifier: Apache-2.0
"""Characterization tests for the JSON Schemas under schemas/.

They pin the contract every adapter and the canonical layer must satisfy.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

SCHEMAS = Path(__file__).resolve().parents[2] / "schemas"


@pytest.mark.parametrize("name", ["statement", "business", "source", "manifest"])
def test_schema_is_valid_draft_2020_12(name: str) -> None:
    schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text())
    Draft202012Validator.check_schema(schema)


def test_statement_requires_provenance_fields() -> None:
    schema = json.loads((SCHEMAS / "statement.schema.json").read_text())
    for field in ("source_ref", "asserted_at", "licence", "precedence", "country"):
        assert field in schema["required"]


def test_statement_example_validates() -> None:
    schema = json.loads((SCHEMAS / "statement.schema.json").read_text())
    example = {
        "statement_id": "0" * 32,
        "entity_id": "kcca.businesses:0123456789abcdef",
        "country": "UG",
        "field": "canonical_name",
        "value": "EXAMPLE HARDWARE SUPPLIES LTD",
        "source": "kcca.businesses",
        "source_ref": "https://kcca.go.ug/sitePages/business_query.php?nature=Hardware",
        "source_record_id": "0123456789abcdef",
        "asserted_at": "2026-08-29T00:00:00Z",
        "licence": "public-record",
        "precedence": 3,
        "confidence": "official",
    }
    Draft202012Validator(schema).validate(example)
