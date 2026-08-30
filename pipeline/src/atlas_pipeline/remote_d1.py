# SPDX-License-Identifier: Apache-2.0
"""Execute SQL against the remote serving D1 database."""

import json
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_APP_DIR = REPO_ROOT / "app"
Runner = Callable[..., subprocess.CompletedProcess[str]]


@dataclass(frozen=True)
class RemoteD1:
    """Small JSON client for the maintainer tables in the serving database."""

    runner: Runner = subprocess.run
    app_dir: Path = DEFAULT_APP_DIR

    def execute(self, sql: str) -> list[dict]:
        command = [
            "pnpm",
            "exec",
            "wrangler",
            "d1",
            "execute",
            "atlas",
            "--remote",
            "--json",
            "--command",
            sql,
        ]
        completed = self.runner(
            command,
            cwd=self.app_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        payload = json.loads(completed.stdout)
        batches = payload if isinstance(payload, list) else [payload]
        rows = []
        for batch in batches:
            if not isinstance(batch, dict) or batch.get("success") is False:
                raise RuntimeError("D1 returned an unsuccessful result")
            result = batch.get("results", [])
            if not isinstance(result, list) or not all(isinstance(row, dict) for row in result):
                raise RuntimeError("D1 returned an invalid result")
            rows.extend(result)
        return rows


def sql_text(value: str | None) -> str:
    """Return a SQLite text literal or NULL."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"
