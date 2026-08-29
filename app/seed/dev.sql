-- Fictional development seed for the local main D1 database (infra/d1/schema.sql).
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

INSERT INTO meta (key, value) VALUES
  ('live_regeneration', 'regen-2026-08-29-0001'),
  ('coverage_applicable', '["kcca.businesses","ura.vat_withholding_agents","ura.customs_agents","ura.wht_exemptions","ppda.ocds","unbs.certified_products","bou.supervised_institutions","cma.licensed_firms","urbra.licensed_schemes","ucc.broadcasters","nlgrb.gaming_operators","kcca.property_rates"]'),
  ('coverage_checked', '["kcca.businesses"]');

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

INSERT INTO businesses (atlas_id, country, canonical_name, name_normalised, name_variants, entity_kind, sector_category, sector_nature, district, division, first_seen, last_seen, coverage, scores)
VALUES
  ('ug-0001', 'UG', 'Example Hardware Supplies Ltd', 'EXAMPLE HARDWARE SUPPLIES LTD', '[]', 'company', 'Trade', 'Hardware', 'Kampala', 'Nakawa', '2026-07-15', '2026-08-12',
   '{"found_in":["kcca.businesses"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0002', 'UG', 'Sample Bakery', 'SAMPLE BAKERY', '[]', 'business_name', 'Manufacturing', 'Bakery', 'Kampala', 'Kawempe', '2026-07-15', '2026-08-12',
   '{"found_in":["kcca.businesses"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0003', 'UG', 'Example Electronics Traders Ltd', 'EXAMPLE ELECTRONICS TRADERS LTD', '[]', 'company', 'Trade', 'Electronics', 'Kampala', 'Nakawa', '2026-07-15', '2026-08-12',
   '{"found_in":["kcca.businesses"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0004', 'UG', 'Example Textiles Ltd', 'EXAMPLE TEXTILES LTD', '[]', 'company', 'Manufacturing', 'Textiles', 'Kampala', 'Kampala Central', '2026-07-15', '2026-08-12',
   '{"found_in":["kcca.businesses"]}',
   '{"formality":{"value":25,"max":100,"checkable":55,"unknown":45,"version":1}}'),
  ('ug-0005', 'UG', 'Example Fresh Produce Suppliers Ltd', 'EXAMPLE FRESH PRODUCE SUPPLIERS LTD', '[]', 'company', 'Trade', 'Agriculture', 'Kampala', 'Kawempe', '2026-07-15', '2026-08-12',
   '{"found_in":["kcca.businesses"]}',
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
-- businesses_fts: mirrors the businesses table (name, name variants, identifiers)
-- ---------------------------------------------------------------------------

INSERT INTO businesses_fts (atlas_id, name, name_variants, identifiers) VALUES
  ('ug-0001', 'Example Hardware Supplies Ltd', '', 'KCCA/2026/00101'),
  ('ug-0002', 'Sample Bakery', '', 'KCCA/2026/00102'),
  ('ug-0003', 'Example Electronics Traders Ltd', '', 'KCCA/2026/00103'),
  ('ug-0004', 'Example Textiles Ltd', '', 'KCCA/2026/00104'),
  ('ug-0005', 'Example Fresh Produce Suppliers Ltd', '', 'KCCA/2026/00105');
