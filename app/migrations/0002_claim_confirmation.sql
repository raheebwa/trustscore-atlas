-- SPDX-License-Identifier: Apache-2.0
ALTER TABLE claims ADD COLUMN expires_at TEXT;
ALTER TABLE claims ADD COLUMN confirmed_at TEXT;
-- Stores only the SHA-256 hash. The plain token is returned once in the confirmation URL.
ALTER TABLE claims ADD COLUMN confirmation_token TEXT;

INSERT INTO claim_events (event_id, claim_id, event_type, occurred_at, payload)
SELECT
  'claim_event_' || lower(hex(randomblob(16))),
  claim_id,
  'unconfirmed',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  json_object('previous_status', 'requested', 'status', 'unconfirmed')
FROM claims
WHERE status = 'requested';

UPDATE claims
SET
  status = 'unconfirmed',
  expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', requested_at, '+24 hours')
WHERE status = 'requested';

CREATE INDEX IF NOT EXISTS claims_status_expires_at
ON claims (status, expires_at);
