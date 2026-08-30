# SPDX-License-Identifier: Apache-2.0
"""Retained load SQL: describe a regeneration's nine SQL files for the R2 index and verify a
downloaded set against that index before a rollback touches any database.

A stale or tampered file set is refused with the reason: a missing file, a checksum or
statement-count mismatch, or a stage file that still inserts the regenerations row without
the upsert (which fails on the primary key when an earlier regeneration is reloaded).
"""

import hashlib
import json
from pathlib import Path

SQL_FILES = (
    "prelude.sql",
    "stage.sql",
    "swap.sql",
    "statements-prelude.sql",
    "statements-stage.sql",
    "statements-swap.sql",
    "scores-prelude.sql",
    "scores-stage.sql",
    "scores-swap.sql",
)
STAGE_FILES = ("stage.sql", "statements-stage.sql", "scores-stage.sql")
UPSERT = "INSERT OR REPLACE INTO regenerations"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _statements(path: Path) -> int:
    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.rstrip().endswith(";"):
                count += 1
    return count


def _has_upsert(path: Path) -> bool:
    with path.open("r", encoding="utf-8") as handle:
        return any(UPSERT in line for line in handle)


def describe_sql_dir(directory: Path) -> dict[str, dict]:
    """One entry per SQL file: sha256, statement count and, for stage files, the upsert flag."""
    directory = Path(directory)
    described: dict[str, dict] = {}
    for name in SQL_FILES:
        path = directory / name
        if not path.is_file():
            raise FileNotFoundError(path)
        entry = {"sha256": _sha256(path), "statements": _statements(path)}
        if name in STAGE_FILES:
            entry["upsert"] = _has_upsert(path)
        described[name] = entry
    return described


def verify_sql_dir(directory: Path, expected: dict[str, dict]) -> list[str]:
    """Reasons the downloaded set must not be loaded; empty when it matches the index."""
    directory = Path(directory)
    reasons: list[str] = []
    for name in SQL_FILES:
        path = directory / name
        if not path.is_file():
            reasons.append(f"{name} is missing")
            continue
        want = expected.get(name)
        if not want:
            reasons.append(f"{name} has no index entry")
            continue
        actual_sha = _sha256(path)
        if actual_sha != want.get("sha256"):
            reasons.append(f"{name} checksum {actual_sha[:12]} differs from the index")
        actual_statements = _statements(path)
        if actual_statements != want.get("statements"):
            expected_statements = want.get("statements")
            reasons.append(
                f"{name} has {actual_statements} statements, the index says {expected_statements}"
            )
        if name in STAGE_FILES and not _has_upsert(path):
            reasons.append(f"{name} inserts the regenerations row without the upsert")
    return reasons


def index_entry(index: dict, regeneration_id: str) -> dict[str, dict] | None:
    files = index.get("files")
    if not isinstance(files, dict):
        return None
    entry = files.get(regeneration_id)
    return entry if isinstance(entry, dict) else None


def load_index(path: Path) -> dict:
    return json.loads(Path(path).read_text())
