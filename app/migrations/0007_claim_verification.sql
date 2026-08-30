-- SPDX-License-Identifier: Apache-2.0
-- D1's migration runner applies each file once, so these ALTER statements need not be idempotent.
ALTER TABLE claims ADD COLUMN verified_at TEXT;
ALTER TABLE claims ADD COLUMN verified_domain TEXT;
ALTER TABLE claims ADD COLUMN verified_url TEXT;
ALTER TABLE corrections ADD COLUMN claim_id TEXT;

-- Verification challenges are append-only audit records except for attempts, consumption,
-- last-attempt timing, and outcome tracking.
CREATE TABLE IF NOT EXISTS claim_challenges (
  challenge_id     TEXT PRIMARY KEY,
  claim_id         TEXT NOT NULL,
  method           TEXT NOT NULL CHECK (method IN ('website_string', 'domain_email')),
  target           TEXT NOT NULL,
  challenge_value  TEXT,
  token_hash       TEXT,
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL,
  consumed_at      TEXT,
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TEXT,
  outcome          TEXT
);

CREATE INDEX IF NOT EXISTS claim_challenges_claim_created
ON claim_challenges (claim_id, created_at);

CREATE TRIGGER IF NOT EXISTS claim_challenges_immutable_fields
BEFORE UPDATE ON claim_challenges
WHEN OLD.challenge_id IS NOT NEW.challenge_id
  OR OLD.claim_id IS NOT NEW.claim_id
  OR OLD.method IS NOT NEW.method
  OR OLD.target IS NOT NEW.target
  OR OLD.challenge_value IS NOT NEW.challenge_value
  OR OLD.token_hash IS NOT NEW.token_hash
  OR OLD.created_at IS NOT NEW.created_at
  OR OLD.expires_at IS NOT NEW.expires_at
BEGIN
  SELECT RAISE(ABORT, 'claim_challenges immutable fields cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS claim_challenges_no_delete
BEFORE DELETE ON claim_challenges
BEGIN
  SELECT RAISE(ABORT, 'claim_challenges cannot be deleted');
END;

-- Uploaded claim evidence is append-only so its original audit record cannot be rewritten.
CREATE TABLE IF NOT EXISTS claim_evidence (
  evidence_id    TEXT PRIMARY KEY,
  claim_id       TEXT NOT NULL,
  r2_key         TEXT NOT NULL UNIQUE,
  content_type   TEXT NOT NULL,
  byte_size      INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  uploaded_at    TEXT NOT NULL,
  uploaded_note  TEXT
);

CREATE TRIGGER IF NOT EXISTS claim_evidence_no_update
BEFORE UPDATE ON claim_evidence
BEGIN
  SELECT RAISE(ABORT, 'claim_evidence is append-only');
END;

CREATE TRIGGER IF NOT EXISTS claim_evidence_no_delete
BEFORE DELETE ON claim_evidence
BEGIN
  SELECT RAISE(ABORT, 'claim_evidence is append-only');
END;

-- Approved operator statements are append-only so each reviewed assertion remains auditable.
CREATE TABLE IF NOT EXISTS operator_statements (
  operator_statement_id  TEXT PRIMARY KEY,
  claim_id               TEXT NOT NULL,
  atlas_id               TEXT NOT NULL,
  field                  TEXT NOT NULL,
  value                  TEXT NOT NULL,
  source_ref             TEXT NOT NULL,
  asserted_at            TEXT NOT NULL,
  decision_id            TEXT,
  created_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS operator_statements_atlas_field
ON operator_statements (atlas_id, field);

-- Compilation rows are append-only receipts linking each statement to one regeneration.
CREATE TABLE IF NOT EXISTS operator_statement_compilations (
  operator_statement_id  TEXT PRIMARY KEY,
  regeneration_id        TEXT NOT NULL,
  compiled_at            TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS operator_statements_no_update
BEFORE UPDATE ON operator_statements
BEGIN
  SELECT RAISE(ABORT, 'operator_statements is append-only');
END;

CREATE TRIGGER IF NOT EXISTS operator_statements_no_delete
BEFORE DELETE ON operator_statements
BEGIN
  SELECT RAISE(ABORT, 'operator_statements is append-only');
END;
