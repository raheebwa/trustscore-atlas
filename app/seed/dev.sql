-- Fictional development seed for the local D1 database (infra/d1/schema.sql).
-- Five fictional businesses across three Kampala divisions, sourced entirely
-- from one fictional pull of the KCCA business licence register. Names,
-- licence numbers, and URLs below are invented for development only; none
-- refer to a real business, person, or phone number.

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

INSERT INTO sources (slug, country, publisher, title, url, licence, cadence, coverage, last_run_id, last_run_at, row_count, adapter_version, status)
VALUES (
  'kcca.businesses',
  'UG',
  'Kampala Capital City Authority (KCCA)',
  'KCCA Business Licences',
  'https://www.kcca.go.ug/business-licences',
  'CC-BY-4.0',
  'monthly',
  'Business licences issued citywide, by division',
  'run-2026-08-12-kcca-businesses',
  '2026-08-12',
  5,
  '0.1.0',
  'fresh'
);

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
-- businesses
-- ---------------------------------------------------------------------------

INSERT INTO businesses (atlas_id, country, canonical_name, name_normalised, name_variants, entity_kind, sector_category, sector_nature, district, division, first_seen, last_seen, coverage, scores)
VALUES
  ('ug-0001', 'UG', 'Example Hardware Supplies Ltd', 'EXAMPLE HARDWARE SUPPLIES LTD', '[]', 'company', 'Trade', 'Hardware', 'Kampala', 'Nakawa', '2026-07-15', '2026-08-12',
   '{"applicable":["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"],"checked":["kcca.businesses"],"found_in":["kcca.businesses"],"not_yet_checked":["ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0002', 'UG', 'Sample Bakery', 'SAMPLE BAKERY', '[]', 'business_name', 'Manufacturing', 'Bakery', 'Kampala', 'Kawempe', '2026-07-15', '2026-08-12',
   '{"applicable":["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"],"checked":["kcca.businesses"],"found_in":["kcca.businesses"],"not_yet_checked":["ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0003', 'UG', 'Example Electronics Traders Ltd', 'EXAMPLE ELECTRONICS TRADERS LTD', '[]', 'company', 'Trade', 'Electronics', 'Kampala', 'Nakawa', '2026-07-15', '2026-08-12',
   '{"applicable":["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"],"checked":["kcca.businesses"],"found_in":["kcca.businesses"],"not_yet_checked":["ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0004', 'UG', 'Example Textiles Ltd', 'EXAMPLE TEXTILES LTD', '[]', 'company', 'Manufacturing', 'Textiles', 'Kampala', 'Kampala Central', '2026-07-15', '2026-08-12',
   '{"applicable":["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"],"checked":["kcca.businesses"],"found_in":["kcca.businesses"],"not_yet_checked":["ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0005', 'UG', 'Example Fresh Produce Suppliers Ltd', 'EXAMPLE FRESH PRODUCE SUPPLIERS LTD', '[]', 'company', 'Trade', 'Agriculture', 'Kampala', 'Kawempe', '2026-07-15', '2026-08-12',
   '{"applicable":["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"],"checked":["kcca.businesses"],"found_in":["kcca.businesses"],"not_yet_checked":["ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}');

-- ---------------------------------------------------------------------------
-- identifiers
-- ---------------------------------------------------------------------------

INSERT INTO identifiers (atlas_id, scheme, value, source) VALUES
  ('ug-0001', 'ug:kcca_licence', 'KCCA/2026/00101', 'kcca.businesses'),
  ('ug-0002', 'ug:kcca_licence', 'KCCA/2026/00102', 'kcca.businesses'),
  ('ug-0003', 'ug:kcca_licence', 'KCCA/2026/00103', 'kcca.businesses'),
  ('ug-0004', 'ug:kcca_licence', 'KCCA/2026/00104', 'kcca.businesses'),
  ('ug-0005', 'ug:kcca_licence', 'KCCA/2026/00105', 'kcca.businesses');

-- ---------------------------------------------------------------------------
-- statements: canonical_name, sector.source_category, sector.source_nature,
-- location.division_or_subcounty, location.district, identifiers
-- ---------------------------------------------------------------------------

INSERT INTO statements (statement_id, atlas_id, entity_id, country, field, value, source, ref_id, source_record_id, asserted_at, licence, precedence, confidence) VALUES
  ('st-0001-01', 'ug-0001', 'KCCA-2026-00101', 'UG', 'canonical_name', 'Example Hardware Supplies Ltd', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0001-02', 'ug-0001', 'KCCA-2026-00101', 'UG', 'sector.source_category', 'Trade', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0001-03', 'ug-0001', 'KCCA-2026-00101', 'UG', 'sector.source_nature', 'Hardware', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0001-04', 'ug-0001', 'KCCA-2026-00101', 'UG', 'location.division_or_subcounty', 'Nakawa', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0001-05', 'ug-0001', 'KCCA-2026-00101', 'UG', 'location.district', 'Kampala', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0001-06', 'ug-0001', 'KCCA-2026-00101', 'UG', 'identifiers', '{"scheme":"ug:kcca_licence","value":"KCCA/2026/00101"}', 'kcca.businesses', '5b06bd8cc2c5', 'KCCA-2026-00101', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),

  ('st-0002-01', 'ug-0002', 'KCCA-2026-00102', 'UG', 'canonical_name', 'Sample Bakery', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0002-02', 'ug-0002', 'KCCA-2026-00102', 'UG', 'sector.source_category', 'Manufacturing', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0002-03', 'ug-0002', 'KCCA-2026-00102', 'UG', 'sector.source_nature', 'Bakery', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0002-04', 'ug-0002', 'KCCA-2026-00102', 'UG', 'location.division_or_subcounty', 'Kawempe', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0002-05', 'ug-0002', 'KCCA-2026-00102', 'UG', 'location.district', 'Kampala', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0002-06', 'ug-0002', 'KCCA-2026-00102', 'UG', 'identifiers', '{"scheme":"ug:kcca_licence","value":"KCCA/2026/00102"}', 'kcca.businesses', '7f1518924e3d', 'KCCA-2026-00102', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),

  ('st-0003-01', 'ug-0003', 'KCCA-2026-00103', 'UG', 'canonical_name', 'Example Electronics Traders Ltd', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0003-02', 'ug-0003', 'KCCA-2026-00103', 'UG', 'sector.source_category', 'Trade', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0003-03', 'ug-0003', 'KCCA-2026-00103', 'UG', 'sector.source_nature', 'Electronics', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0003-04', 'ug-0003', 'KCCA-2026-00103', 'UG', 'location.division_or_subcounty', 'Nakawa', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0003-05', 'ug-0003', 'KCCA-2026-00103', 'UG', 'location.district', 'Kampala', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0003-06', 'ug-0003', 'KCCA-2026-00103', 'UG', 'identifiers', '{"scheme":"ug:kcca_licence","value":"KCCA/2026/00103"}', 'kcca.businesses', '7ffee27439d2', 'KCCA-2026-00103', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),

  ('st-0004-01', 'ug-0004', 'KCCA-2026-00104', 'UG', 'canonical_name', 'Example Textiles Ltd', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0004-02', 'ug-0004', 'KCCA-2026-00104', 'UG', 'sector.source_category', 'Manufacturing', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0004-03', 'ug-0004', 'KCCA-2026-00104', 'UG', 'sector.source_nature', 'Textiles', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0004-04', 'ug-0004', 'KCCA-2026-00104', 'UG', 'location.division_or_subcounty', 'Kampala Central', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0004-05', 'ug-0004', 'KCCA-2026-00104', 'UG', 'location.district', 'Kampala', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0004-06', 'ug-0004', 'KCCA-2026-00104', 'UG', 'identifiers', '{"scheme":"ug:kcca_licence","value":"KCCA/2026/00104"}', 'kcca.businesses', '0ef944ea7cc5', 'KCCA-2026-00104', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),

  ('st-0005-01', 'ug-0005', 'KCCA-2026-00105', 'UG', 'canonical_name', 'Example Fresh Produce Suppliers Ltd', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0005-02', 'ug-0005', 'KCCA-2026-00105', 'UG', 'sector.source_category', 'Trade', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0005-03', 'ug-0005', 'KCCA-2026-00105', 'UG', 'sector.source_nature', 'Agriculture', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0005-04', 'ug-0005', 'KCCA-2026-00105', 'UG', 'location.division_or_subcounty', 'Kawempe', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0005-05', 'ug-0005', 'KCCA-2026-00105', 'UG', 'location.district', 'Kampala', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official'),
  ('st-0005-06', 'ug-0005', 'KCCA-2026-00105', 'UG', 'identifiers', '{"scheme":"ug:kcca_licence","value":"KCCA/2026/00105"}', 'kcca.businesses', '31b4cf04cd2e', 'KCCA-2026-00105', '2026-08-12T08:00:00Z', 'CC-BY-4.0', 3, 'official');
INSERT INTO refs (ref_id, source_ref) VALUES
('5b06bd8cc2c5', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00101'),
('7f1518924e3d', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00102'),
('7ffee27439d2', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00103'),
('0ef944ea7cc5', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00104'),
('31b4cf04cd2e', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00105');


-- ---------------------------------------------------------------------------
-- scores: one Formality row per business (docs/PRD.md section 9.1 shape)
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

-- ---------------------------------------------------------------------------
-- businesses_fts: mirrors the businesses table (name, name variants, identifiers)
-- ---------------------------------------------------------------------------

INSERT INTO businesses_fts (atlas_id, name, name_variants, identifiers) VALUES
  ('ug-0001', 'Example Hardware Supplies Ltd', '', 'KCCA/2026/00101'),
  ('ug-0002', 'Sample Bakery', '', 'KCCA/2026/00102'),
  ('ug-0003', 'Example Electronics Traders Ltd', '', 'KCCA/2026/00103'),
  ('ug-0004', 'Example Textiles Ltd', '', 'KCCA/2026/00104'),
  ('ug-0005', 'Example Fresh Produce Suppliers Ltd', '', 'KCCA/2026/00105');
