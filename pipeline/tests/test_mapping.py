import json
from datetime import UTC, datetime

from atlas_pipeline.mapping import build_statements


def test_native_identifier_column_is_serialized_with_its_scheme():
    records = [
        {
            "record_id": "record-1",
            "_entity_key": "entity-1",
            "tin": "1000000001",
            "source_ref": "https://example.org/register",
        }
    ]
    mapping = {
        "country": "UG",
        "precedence_class": "register_of_record",
        "confidence": "official",
        "source_ref": {"from": "source_ref"},
        "statements": [{"field": "identifiers", "identifier": "ug:tin", "from": "tin"}],
    }
    source = {"slug": "ura.example", "licence": "public-record"}

    statements = build_statements(records, mapping, source, datetime(2026, 8, 29, tzinfo=UTC))

    assert len(statements) == 1
    assert json.loads(statements[0]["value"]) == {"scheme": "ug:tin", "value": "1000000001"}
