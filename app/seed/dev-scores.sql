-- SPDX-License-Identifier: Apache-2.0
-- Fictional development seed for the local scores D1 database.
-- It matches the live regeneration in dev.sql and dev-statements.sql.

-- ---------------------------------------------------------------------------
-- regenerations and meta
-- ---------------------------------------------------------------------------

INSERT INTO regenerations (id, started_at, finished_at, inputs, status)
VALUES (
  'regen-2026-08-29-0001',
  '2026-08-29T09:00:00Z',
  '2026-08-29T09:05:00Z',
  '{"kcca.businesses":"run-2026-08-12-kcca-businesses"}',
  'live'
);

INSERT INTO meta (key, value) VALUES ('live_regeneration', 'regen-2026-08-29-0001');

-- ---------------------------------------------------------------------------
-- scores: one Formality row per fictional business
-- ---------------------------------------------------------------------------

WITH score_seed(atlas_id, statement_id) AS (
  VALUES
    ('ug-0001', 'st-0001-06'),
    ('ug-0002', 'st-0002-06'),
    ('ug-0003', 'st-0003-06'),
    ('ug-0004', 'st-0004-06'),
    ('ug-0005', 'st-0005-06')
)
INSERT INTO scores (atlas_id, rubric, version, regeneration_id, value, max, checkable, unknown, coverage, evidence, evaluation_as_of)
SELECT
  atlas_id,
  'formality',
  1,
  'regen-2026-08-29-0001',
  25,
  100,
  55,
  45,
  '{"applicable":12,"checked":1,"found_in":1,"not_yet_checked":11}',
  replace('[{"predicate":"kcca.businesses","points":25,"statement_ids":["__STATEMENT_ID__"],"as_of":"2026-08-12"},{"predicate":"ura.vat_withholding_agents","points":0,"reason":"not checked (register unavailable)"},{"predicate":"ura.customs_agents","points":0,"reason":"not checked (register unavailable)"},{"predicate":"ura.wht_exemptions","points":0,"reason":"not checked (register unavailable)"},{"predicate":"ppda.ocds","points":0,"reason":"not checked (register unavailable)"},{"predicate":"unbs.certified_products","points":0,"reason":"not checked (register unavailable)"},{"predicate":"bou.supervised_institutions","points":0,"reason":"not checked (register unavailable)"},{"predicate":"cma.licensed_firms","points":0,"reason":"not checked (register unavailable)"},{"predicate":"urbra.licensed_schemes","points":0,"reason":"not checked (register unavailable)"},{"predicate":"ucc.broadcasters","points":0,"reason":"not checked (register unavailable)"},{"predicate":"nlgrb.gaming_operators","points":0,"reason":"not checked (register unavailable)"},{"predicate":"kcca.property_rates","points":0,"reason":"not checked (register unavailable)"}]', '__STATEMENT_ID__', statement_id),
  '2026-08-29T09:05:00Z'
FROM score_seed;
