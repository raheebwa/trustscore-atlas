-- Fictional development seed for the local statements D1 database.
-- It matches the live regeneration in dev.sql. Names, licence numbers, and
-- URLs below are invented for development only.

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
-- refs
-- ---------------------------------------------------------------------------

INSERT INTO refs (ref_id, source_ref) VALUES
  ('5b06bd8cc2c5', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00101'),
  ('7f1518924e3d', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00102'),
  ('7ffee27439d2', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00103'),
  ('0ef944ea7cc5', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00104'),
  ('31b4cf04cd2e', 'https://www.kcca.go.ug/business-licences/KCCA-2026-00105');

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
