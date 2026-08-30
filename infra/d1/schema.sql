-- SPDX-License-Identifier: Apache-2.0
-- Serving schema for the regenerated tables (docs/ARCHITECTURE.md section 7).
-- The regeneration writer creates each table under a staged name (<table>__<regeneration_id>),
-- loads it, then swaps it into place. Append-only ops tables live in the application migrations.

CREATE TABLE businesses (
  atlas_id            TEXT PRIMARY KEY,
  country             TEXT NOT NULL,
  canonical_name      TEXT NOT NULL,
  name_normalised     TEXT NOT NULL,
  name_variants       TEXT NOT NULL DEFAULT '[]',   -- JSON array of losing name values
  entity_kind         TEXT NOT NULL,
  sector_category     TEXT,
  sector_nature       TEXT,
  district            TEXT,
  division            TEXT,
  first_seen          TEXT NOT NULL,                -- ISO date
  last_seen           TEXT NOT NULL,                -- ISO date
  coverage            TEXT NOT NULL,                -- JSON {applicable:[], checked:[], found_in:[], not_yet_checked:[]}
  scores              TEXT NOT NULL DEFAULT '{}'    -- JSON {rubric: {value, max, version}}
);
CREATE INDEX businesses_name_normalised ON businesses (name_normalised);
CREATE INDEX businesses_division ON businesses (division);
CREATE INDEX businesses_sector ON businesses (sector_category, sector_nature);

CREATE TABLE segments (
  country TEXT NOT NULL,
  sector_category TEXT,
  sector_nature TEXT,
  district TEXT,
  division TEXT,
  register TEXT,
  business_count INTEGER NOT NULL
);
CREATE INDEX segments_lookup
ON segments (country, sector_category, sector_nature, district, division, register);

CREATE TABLE identifiers (
  atlas_id  TEXT NOT NULL,
  scheme    TEXT NOT NULL,
  value     TEXT NOT NULL,
  source    TEXT NOT NULL,
  PRIMARY KEY (atlas_id, scheme, value, source)   -- one row per register that carries the id
);
CREATE INDEX identifiers_lookup ON identifiers (scheme, value);

CREATE TABLE statements (
  statement_id      TEXT PRIMARY KEY,
  atlas_id          TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  country           TEXT NOT NULL,
  field             TEXT NOT NULL,
  value             TEXT NOT NULL,
  source            TEXT NOT NULL,
  ref_id            TEXT NOT NULL,                  -- refs.ref_id; the source reference text lives once in refs
  source_record_id  TEXT NOT NULL,
  asserted_at       TEXT NOT NULL,                  -- ISO timestamp, UTC
  licence           TEXT NOT NULL,
  precedence        INTEGER NOT NULL,
  confidence        TEXT NOT NULL
);
CREATE INDEX statements_trace ON statements (atlas_id, field, precedence, asserted_at);

-- Distinct source references (URLs, document names, API calls) shared by many statements.
CREATE TABLE refs (
  ref_id      TEXT PRIMARY KEY,                     -- first 12 hex of sha256(source_ref)
  source_ref  TEXT NOT NULL
);

CREATE TABLE aliases (
  atlas_id            TEXT PRIMARY KEY,               -- an id that merged into another
  canonical_atlas_id  TEXT NOT NULL,                  -- the surviving id
  reason              TEXT NOT NULL                   -- the identifier scheme that joined them
);

CREATE TABLE linkage_candidates (
  atlas_id_a         TEXT NOT NULL,
  atlas_id_b         TEXT NOT NULL,
  match_probability  REAL NOT NULL,
  match_weight       REAL NOT NULL,
  comparison         TEXT NOT NULL,                   -- JSON comparison vector
  blocking_rule      TEXT NOT NULL,
  model_version      TEXT NOT NULL,
  PRIMARY KEY (atlas_id_a, atlas_id_b, model_version)
);
CREATE INDEX linkage_candidates_b ON linkage_candidates (atlas_id_b);

CREATE TABLE scores (
  atlas_id         TEXT NOT NULL,
  rubric           TEXT NOT NULL,
  version          INTEGER NOT NULL,
  regeneration_id  TEXT NOT NULL,
  value            INTEGER NOT NULL,
  max              INTEGER NOT NULL,
  checkable        INTEGER NOT NULL,                -- points that could be observed given checked registers
  unknown          INTEGER NOT NULL,                -- max minus checkable
  coverage         TEXT NOT NULL,                   -- JSON {applicable, checked, found_in, not_yet_checked} counts
  evidence         TEXT NOT NULL,                   -- JSON array of evidence rows
  evaluation_as_of TEXT NOT NULL,                   -- regeneration time; part of the score identity
  PRIMARY KEY (atlas_id, rubric, version, regeneration_id)
);

CREATE TABLE sources (
  slug             TEXT PRIMARY KEY,
  country          TEXT NOT NULL,
  publisher        TEXT NOT NULL,
  title            TEXT NOT NULL,
  url              TEXT NOT NULL,
  licence          TEXT NOT NULL,
  cadence          TEXT NOT NULL,
  coverage         TEXT,
  last_run_id      TEXT,
  last_run_at      TEXT,
  row_count        INTEGER,
  adapter_version  TEXT,
  status           TEXT NOT NULL,                   -- fresh | stale | failed | not_loaded | disabled | flagged
  status_note      TEXT                             -- plain-language qualifier shown on the sources page
);

CREATE TABLE regenerations (
  id           TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL,
  inputs       TEXT NOT NULL,                       -- JSON {source_slug: run_id}
  status       TEXT NOT NULL                        -- staged | live | rolled_back
);

CREATE TABLE meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Search index. Trigram tokenizer verified on local D1; the application falls back to
-- name_normalised LIKE when a query is shorter than three characters.
CREATE VIRTUAL TABLE businesses_fts USING fts5(
  atlas_id UNINDEXED,
  name,
  name_variants,
  identifiers,
  tokenize = 'trigram'
);
