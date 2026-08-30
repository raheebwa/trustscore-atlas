# SPDX-License-Identifier: Apache-2.0
"""Compile append-only maintainer linkage verdicts into canonical labels."""

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from .remote_d1 import DEFAULT_APP_DIR, RemoteD1, Runner, sql_text

UNCOMPILED_LABELS_SQL = """
SELECT m.label_id, m.atlas_id, m.candidate_atlas_id, m.verdict,
       m.reason, m.labelled_by, m.labelled_at
FROM maintainer_labels AS m
LEFT JOIN maintainer_label_compilations AS c ON c.label_id = m.label_id
WHERE c.label_id IS NULL
ORDER BY m.labelled_at, m.label_id
""".strip()


def _timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def compile_maintainer_labels(
    *,
    data_root: Path,
    regeneration_id: str,
    runner: Runner = subprocess.run,
    app_dir: Path = DEFAULT_APP_DIR,
    compiled_at: str | None = None,
) -> list[dict]:
    """Append uncompiled maintainer verdicts and record their regeneration."""
    client = RemoteD1(runner=runner, app_dir=app_dir)
    rows = client.execute(UNCOMPILED_LABELS_SQL)
    if not rows:
        return []

    labels_path = Path(data_root) / "canonical" / "labels.jsonl"
    existing = labels_path.read_text() if labels_path.exists() else ""
    next_row = sum(bool(line.strip()) for line in existing.splitlines()) + 1
    labels = [
        {
            "atlas_id": row["atlas_id"],
            "candidate_atlas_id": row["candidate_atlas_id"],
            "verdict": row["verdict"],
            "labelled_at": row["labelled_at"],
            "labelled_by": row["labelled_by"],
            "note": row["reason"],
            "decision": f"OPS-{row['label_id']}",
            "row": next_row + offset,
        }
        for offset, row in enumerate(rows)
    ]
    labels_path.parent.mkdir(parents=True, exist_ok=True)
    with labels_path.open("a", encoding="utf-8") as labels_file:
        if existing and not existing.endswith("\n"):
            labels_file.write("\n")
        for label in labels:
            labels_file.write(json.dumps(label) + "\n")

    stamp = compiled_at or _timestamp()
    for row in rows:
        client.execute(
            "INSERT INTO maintainer_label_compilations "
            "(label_id, regeneration_id, compiled_at) VALUES "
            f"({sql_text(row['label_id'])}, {sql_text(regeneration_id)}, {sql_text(stamp)})"
        )
    return labels
