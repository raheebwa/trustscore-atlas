from datetime import UTC, datetime
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PACKS = REPO / "packs"
SCHEMAS = REPO / "schemas"
RUN_ID = "20260829T000000Z"
STARTED_AT = datetime(2026, 8, 29, 0, 0, 0, tzinfo=UTC)
SALT = "fixture-salt"


@pytest.fixture
def repo() -> Path:
    return REPO
