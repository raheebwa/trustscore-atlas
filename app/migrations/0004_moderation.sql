-- SPDX-License-Identifier: Apache-2.0
-- Maintainer decisions on confirmed requests. Confirmation (the requester proved the
-- request is theirs) and moderation (a maintainer accepted or declined it) are separate
-- states; a decision never rewrites the request row.
CREATE TABLE IF NOT EXISTS moderation_decisions (
  decision_id   TEXT PRIMARY KEY,
  request_type  TEXT NOT NULL CHECK (request_type IN ('claim', 'correction', 'linkage_label', 'issue')),
  request_id    TEXT NOT NULL,
  decision      TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason        TEXT NOT NULL,
  decided_by    TEXT NOT NULL,
  decided_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_decisions_request
ON moderation_decisions (request_type, request_id);

CREATE TRIGGER IF NOT EXISTS moderation_decisions_no_update
BEFORE UPDATE ON moderation_decisions
BEGIN
  SELECT RAISE(ABORT, 'moderation_decisions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS moderation_decisions_no_delete
BEFORE DELETE ON moderation_decisions
BEGIN
  SELECT RAISE(ABORT, 'moderation_decisions is append-only');
END;
