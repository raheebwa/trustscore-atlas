-- SPDX-License-Identifier: Apache-2.0
-- What an approval rested on, recorded with the decision.
--
-- A verified claim proves control of a domain, never that the business is the claimant's. Whether
-- a register published that domain for the record is the separate question, and when the answer is
-- no, a maintainer's own judgement is the whole basis for approving. Both halves are written here
-- because neither is reconstructible later: the statements table is dropped and rebuilt by every
-- regeneration, so re-running the register check afterwards can answer differently.
ALTER TABLE moderation_decisions ADD COLUMN domain_matched_register INTEGER;
ALTER TABLE moderation_decisions ADD COLUMN domain_relationship_reviewed INTEGER NOT NULL DEFAULT 0;

-- A correction filed from a claim. Nothing writes it yet; the gate reads it, and treats a
-- correction with no claim as one that asserts nothing on its own.
CREATE INDEX IF NOT EXISTS corrections_claim ON corrections (claim_id);

-- Evidence is read per claim on every queue load.
CREATE INDEX IF NOT EXISTS claim_evidence_claim ON claim_evidence (claim_id);
