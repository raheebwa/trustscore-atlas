-- SPDX-License-Identifier: Apache-2.0
CREATE TABLE IF NOT EXISTS claims (
  claim_id             TEXT PRIMARY KEY,
  atlas_id             TEXT NOT NULL,
  claimant_role        TEXT NOT NULL,
  requested_at         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'requested',
  verification_method  TEXT
);

CREATE INDEX IF NOT EXISTS claims_atlas_id ON claims (atlas_id, requested_at);

CREATE TABLE IF NOT EXISTS claim_events (
  event_id     TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  occurred_at  TEXT NOT NULL,
  payload      TEXT NOT NULL,
  FOREIGN KEY (claim_id) REFERENCES claims (claim_id)
);

CREATE INDEX IF NOT EXISTS claim_events_claim_id ON claim_events (claim_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS claim_events_no_update
BEFORE UPDATE ON claim_events
BEGIN
  SELECT RAISE(ABORT, 'claim_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS claim_events_no_delete
BEFORE DELETE ON claim_events
BEGIN
  SELECT RAISE(ABORT, 'claim_events is append-only');
END;
