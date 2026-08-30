# SPDX-License-Identifier: Apache-2.0
"""Compile approved operator statements into an input the next regeneration reads.

An approval on the maintainer surface asserts something about a record: that an operator was
verified, or that a field a verified claimant corrected should read differently. Until it is
compiled, it has changed nothing that is served, which is exactly what the queue says it is in.

Compiling is append-only on both sides. The file grows by one line per approval, and each
statement records the regeneration that took it, so a second run takes nothing the first already
took and a file is never rewritten.
"""

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from .remote_d1 import DEFAULT_APP_DIR, RemoteD1, Runner, sql_text

UNCOMPILED_STATEMENTS_SQL = """
SELECT o.operator_statement_id, o.claim_id, o.atlas_id, o.field, o.value,
       o.source_ref, o.asserted_at
FROM operator_statements AS o
LEFT JOIN operator_statement_compilations AS c
  ON c.operator_statement_id = o.operator_statement_id
WHERE c.operator_statement_id IS NULL
ORDER BY o.asserted_at, o.operator_statement_id
""".strip()


def _timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def compile_operator_statements(
    *,
    data_root: Path,
    regeneration_id: str,
    runner: Runner = subprocess.run,
    app_dir: Path = DEFAULT_APP_DIR,
    compiled_at: str | None = None,
) -> list[dict]:
    """Append approved statements not yet compiled, and record their regeneration."""
    client = RemoteD1(runner=runner, app_dir=app_dir)
    rows = client.execute(UNCOMPILED_STATEMENTS_SQL)
    if not rows:
        return []

    path = Path(data_root) / "canonical" / "operator_statements.jsonl"
    existing = path.read_text() if path.exists() else ""
    next_row = sum(bool(line.strip()) for line in existing.splitlines()) + 1
    statements = [
        {
            "atlas_id": row["atlas_id"],
            "field": row["field"],
            "value": row["value"],
            "claim_id": row["claim_id"],
            # What a reader follows back to the decision: the claim the assertion rests on.
            "source_ref": row["source_ref"],
            "asserted_at": row["asserted_at"],
            "operator_statement_id": row["operator_statement_id"],
            "row": next_row + offset,
        }
        for offset, row in enumerate(rows)
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        if existing and not existing.endswith("\n"):
            file.write("\n")
        for statement in statements:
            file.write(json.dumps(statement) + "\n")

    stamp = compiled_at or _timestamp()
    for row in rows:
        client.execute(
            "INSERT INTO operator_statement_compilations "
            "(operator_statement_id, regeneration_id, compiled_at) VALUES "
            f"({sql_text(row['operator_statement_id'])}, {sql_text(regeneration_id)}, "
            f"{sql_text(stamp)})"
        )
    return statements
