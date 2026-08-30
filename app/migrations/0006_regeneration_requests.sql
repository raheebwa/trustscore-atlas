-- Maintainer requests for the pipeline: regenerate now, or roll back to an earlier regeneration.
-- The refresh workflow consumes pending rows; rows are append-only and status moves through a
-- separate events table so a request keeps its history.
CREATE TABLE IF NOT EXISTS regeneration_requests (
  request_id     TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('regenerate', 'rollback')),
  target_id      TEXT,
  reason         TEXT NOT NULL,
  requested_by   TEXT NOT NULL,
  requested_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regeneration_request_events (
  event_id     TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'dispatched', 'running', 'done', 'failed', 'refused')),
  note         TEXT,
  occurred_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS regeneration_request_events_request
ON regeneration_request_events (request_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS regeneration_requests_no_update
BEFORE UPDATE ON regeneration_requests
BEGIN
  SELECT RAISE(ABORT, 'regeneration_requests is append-only');
END;

CREATE TRIGGER IF NOT EXISTS regeneration_requests_no_delete
BEFORE DELETE ON regeneration_requests
BEGIN
  SELECT RAISE(ABORT, 'regeneration_requests is append-only');
END;
