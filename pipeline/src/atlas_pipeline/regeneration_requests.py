# SPDX-License-Identifier: Apache-2.0
"""Read and append events for maintainer regeneration requests."""

import subprocess
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .remote_d1 import DEFAULT_APP_DIR, RemoteD1, Runner, sql_text

REQUEST_KINDS = ("regenerate", "rollback")
REQUEST_STATUSES = ("pending", "dispatched", "running", "done", "failed", "refused")


def _timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def next_pending_request(
    *,
    data_root: Path,
    kind: str | None = None,
    runner: Runner = subprocess.run,
    app_dir: Path = DEFAULT_APP_DIR,
) -> dict | None:
    """Return the oldest request whose latest event is pending."""
    if kind is not None and kind not in REQUEST_KINDS:
        raise ValueError(f"unsupported request kind: {kind}")
    kind_filter = f" AND r.kind = {sql_text(kind)}" if kind else ""
    sql = f"""
SELECT r.request_id, r.kind, r.target_id, r.reason, r.requested_by, r.requested_at
FROM regeneration_requests AS r
JOIN regeneration_request_events AS e ON e.rowid = (
  SELECT latest.rowid
  FROM regeneration_request_events AS latest
  WHERE latest.request_id = r.request_id
  ORDER BY latest.occurred_at DESC, latest.rowid DESC
  LIMIT 1
)
WHERE e.status = 'pending'{kind_filter}
ORDER BY r.requested_at, r.rowid
LIMIT 1
""".strip()
    rows = RemoteD1(runner=runner, app_dir=app_dir).execute(sql)
    return rows[0] if rows else None


def mark_request(
    *,
    request_id: str,
    status: str,
    note: str | None = None,
    runner: Runner = subprocess.run,
    app_dir: Path = DEFAULT_APP_DIR,
    event_id: str | None = None,
    occurred_at: str | None = None,
) -> dict:
    """Append a status event for a regeneration request."""
    if status not in REQUEST_STATUSES:
        raise ValueError(f"unsupported request status: {status}")
    event = {
        "event_id": event_id or f"rrev_{uuid.uuid4().hex}",
        "request_id": request_id,
        "status": status,
        "note": note,
        "occurred_at": occurred_at or _timestamp(),
    }
    RemoteD1(runner=runner, app_dir=app_dir).execute(
        "INSERT INTO regeneration_request_events "
        "(event_id, request_id, status, note, occurred_at) VALUES "
        f"({sql_text(event['event_id'])}, {sql_text(request_id)}, {sql_text(status)}, "
        f"{sql_text(note)}, {sql_text(event['occurred_at'])})"
    )
    return event
