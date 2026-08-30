-- Linkage verdicts recorded by maintainers on the review screen. Append-only: the pipeline
-- compiles rows into the canonical labels file at the next regeneration and records which
-- regeneration compiled each row in a second append-only table.
CREATE TABLE IF NOT EXISTS maintainer_labels (
  label_id            TEXT PRIMARY KEY,
  atlas_id            TEXT NOT NULL,
  candidate_atlas_id  TEXT NOT NULL,
  verdict             TEXT NOT NULL CHECK (verdict IN ('match', 'non_match')),
  reason              TEXT NOT NULL,
  labelled_by         TEXT NOT NULL,
  labelled_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS maintainer_labels_pair
ON maintainer_labels (atlas_id, candidate_atlas_id, labelled_at);

CREATE TABLE IF NOT EXISTS maintainer_label_compilations (
  label_id         TEXT PRIMARY KEY,
  regeneration_id  TEXT NOT NULL,
  compiled_at      TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS maintainer_labels_no_update
BEFORE UPDATE ON maintainer_labels
BEGIN
  SELECT RAISE(ABORT, 'maintainer_labels is append-only');
END;

CREATE TRIGGER IF NOT EXISTS maintainer_labels_no_delete
BEFORE DELETE ON maintainer_labels
BEGIN
  SELECT RAISE(ABORT, 'maintainer_labels is append-only');
END;
