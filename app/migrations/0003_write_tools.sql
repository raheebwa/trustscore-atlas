-- SPDX-License-Identifier: Apache-2.0
CREATE TABLE IF NOT EXISTS corrections (
  correction_id          TEXT PRIMARY KEY,
  atlas_id               TEXT NOT NULL,
  field                  TEXT NOT NULL CHECK (field IN (
    'canonical_name',
    'name_variants',
    'sector.source_category',
    'sector.source_nature',
    'location.district',
    'location.division_or_subcounty',
    'website',
    'description'
  )),
  value                   TEXT NOT NULL,
  evidence_url            TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('unconfirmed', 'confirmed', 'rejected')),
  requested_at            TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  confirmed_at            TEXT,
  confirmation_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS corrections_atlas_status_requested
ON corrections (atlas_id, status, requested_at);

CREATE INDEX IF NOT EXISTS corrections_status_expires
ON corrections (status, expires_at);

CREATE TABLE IF NOT EXISTS linkage_labels (
  label_id                TEXT PRIMARY KEY,
  atlas_id               TEXT NOT NULL,
  candidate_atlas_id     TEXT NOT NULL,
  verdict                 TEXT NOT NULL CHECK (verdict IN ('match', 'non_match')),
  status                  TEXT NOT NULL CHECK (status IN ('unconfirmed', 'confirmed', 'rejected')),
  requested_at            TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  confirmed_at            TEXT,
  confirmation_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS linkage_labels_pair_status_requested
ON linkage_labels (atlas_id, candidate_atlas_id, status, requested_at);

CREATE INDEX IF NOT EXISTS linkage_labels_status_expires
ON linkage_labels (status, expires_at);

CREATE TABLE IF NOT EXISTS issues (
  issue_id                TEXT PRIMARY KEY,
  atlas_id               TEXT,
  source                  TEXT,
  description             TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('unconfirmed', 'confirmed', 'rejected')),
  requested_at            TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  confirmed_at            TEXT,
  confirmation_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS issues_atlas_status_requested
ON issues (atlas_id, status, requested_at);

CREATE INDEX IF NOT EXISTS issues_source_status_requested
ON issues (source, status, requested_at);

CREATE INDEX IF NOT EXISTS issues_status_expires
ON issues (status, expires_at);

CREATE TABLE IF NOT EXISTS write_request_events (
  event_id      TEXT PRIMARY KEY,
  request_type  TEXT NOT NULL CHECK (request_type IN ('correction', 'linkage_label', 'issue')),
  request_id    TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('unconfirmed', 'confirmed', 'rejected')),
  occurred_at   TEXT NOT NULL,
  payload       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS write_request_events_request
ON write_request_events (request_type, request_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS write_request_events_no_update
BEFORE UPDATE ON write_request_events
BEGIN
  SELECT RAISE(ABORT, 'write_request_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS write_request_events_no_delete
BEFORE DELETE ON write_request_events
BEGIN
  SELECT RAISE(ABORT, 'write_request_events is append-only');
END;
