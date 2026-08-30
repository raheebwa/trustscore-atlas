// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
	PUBLISHABLE_STATEMENT_FIELDS,
	buildProvenanceTable,
	composeCoverage,
	getConsistentLiveRegenerationId,
	getFieldTrace,
	getStatementsPage,
	searchBusinesses
} from './atlas';
import type { StatementRow } from '$lib/types';

function statement(overrides: Partial<StatementRow>): StatementRow {
	return {
		statement_id: 's1',
		atlas_id: 'atlas-1',
		country: 'UG',
		field: 'canonical_name',
		value: 'Example Hardware Supplies Ltd',
		source: 'kcca.businesses',
		source_ref: 'https://example.org/kcca/1',
		source_record_id: '1',
		asserted_at: '2026-08-01T00:00:00Z',
		licence: 'CC-BY-4.0',
		precedence: 3,
		confidence: 'official',
		...overrides
	};
}

describe('buildProvenanceTable', () => {
	it('returns one winning row per field, sorted by field name', () => {
		const statements = [
			statement({
				statement_id: 's1',
				field: 'location.district',
				precedence: 3,
				value: 'Kampala'
			}),
			statement({
				statement_id: 's2',
				field: 'canonical_name',
				precedence: 2,
				value: 'Example Hardware Supplies Ltd'
			}),
			statement({
				statement_id: 's3',
				field: 'canonical_name',
				precedence: 4,
				value: 'Example Hardware'
			})
		];
		const table = buildProvenanceTable(statements, 'atlas-example-1');
		expect(table.map((r) => r.field)).toEqual(['canonical_name', 'location.district']);
		expect(table[0].value).toBe('Example Hardware Supplies Ltd');
		expect(table[0].precedence).toBe(2);
	});

	it('uses distinct source-record support before recency', () => {
		const table = buildProvenanceTable(
			[
				statement({
					statement_id: 'recent',
					value: 'Example Hardware',
					source_record_id: 'recent-record',
					asserted_at: '2026-08-29T00:00:00Z'
				}),
				statement({
					statement_id: 'supported-1',
					value: 'Example Hardware Supplies Ltd',
					source_record_id: 'support-1',
					asserted_at: '2026-08-01T00:00:00Z'
				}),
				statement({
					statement_id: 'supported-2',
					value: 'Example Hardware Supplies Ltd',
					source_record_id: 'support-2',
					asserted_at: '2026-08-01T00:00:00Z'
				})
			],
			'atlas-example-1'
		);

		expect(table[0].value).toBe('Example Hardware Supplies Ltd');
	});
});

function statementDb(rows: StatementRow[]): D1Database {
	return {
		prepare: () => ({
			bind: () => ({
				all: async () => ({ results: rows }),
				first: async () => ({ value: 'regen-example-1' })
			})
		})
	} as unknown as D1Database;
}

describe('publishable statement boundary', () => {
	it('drops contact fields and contact-like values from statement and trace response data', async () => {
		const rows = [
			statement({ statement_id: 'safe', value: 'Example Hardware Supplies Ltd' }),
			statement({
				statement_id: 'email-value',
				value: 'records@example.invalid'
			}),
			statement({
				statement_id: 'contact-field',
				field: 'status.contact',
				value: 'Ask at the main counter'
			})
		];
		const db = statementDb(rows);
		const databases = { db, statementsDb: db, scoresDb: db };

		const statementPage = await getStatementsPage(databases, 'atlas-1');
		const trace = await getFieldTrace(databases, 'atlas-1', 'canonical_name');

		expect(PUBLISHABLE_STATEMENT_FIELDS).toContain('status.*');
		expect(statementPage.statements.map((row) => row.statement_id)).toEqual(['safe']);
		expect(trace.statements.map((row) => row.statement_id)).toEqual(['safe']);
	});
});

function metaDb(liveRegenerationId: string): D1Database {
	return {
		prepare: () => ({
			bind: () => ({
				first: async () => ({ value: liveRegenerationId })
			})
		})
	} as unknown as D1Database;
}

describe('serving regeneration consistency', () => {
	it('compares the main, statements, and scores live pointers', async () => {
		await expect(
			getConsistentLiveRegenerationId({
				db: metaDb('regen-example-1'),
				statementsDb: metaDb('regen-example-1'),
				scoresDb: metaDb('regen-example-2')
			})
		).rejects.toMatchObject({ name: 'RegenerationInProgressError' });
	});
});

describe('business coverage composition', () => {
	it('combines pack metadata with row presence and excludes unchecked presence', () => {
		expect(
			composeCoverage(
				JSON.stringify({
					found_in: ['example.checked', 'example.not-checked', 'example.checked']
				}),
				['example.checked', 'example.not-checked', 'example.pending'],
				['example.checked']
			)
		).toEqual({
			applicable: ['example.checked', 'example.not-checked', 'example.pending'],
			checked: ['example.checked'],
			found_in: ['example.checked'],
			not_yet_checked: ['example.not-checked', 'example.pending']
		});
	});
});

function searchDb(coverageReads: { value: number }): D1Database {
	const business = {
		atlas_id: 'atlas-search-1',
		country: 'UG',
		canonical_name: 'Example Hardware Supplies Ltd',
		name_normalised: 'EXAMPLE HARDWARE SUPPLIES LTD',
		name_variants: '[]',
		entity_kind: 'company',
		sector_category: 'Trade',
		sector_nature: 'Hardware',
		district: 'Kampala',
		division: 'Nakawa',
		first_seen: '2026-08-01',
		last_seen: '2026-08-29',
		coverage: JSON.stringify({ found_in: ['example.checked', 'example.not-checked'] }),
		scores: JSON.stringify({
			formality: { value: 25, max: 100, checkable: 55, unknown: 45, version: 1 }
		})
	};
	const secondBusiness = {
		...business,
		atlas_id: 'atlas-search-2',
		canonical_name: 'Example Hardware Traders Ltd'
	};
	const score = {
		atlas_id: business.atlas_id,
		rubric: 'formality',
		version: 1,
		regeneration_id: 'regen-example-1',
		value: 25,
		max: 100,
		checkable: 55,
		unknown: 45,
		coverage: JSON.stringify({ applicable: 4, checked: 2, found_in: 1, not_yet_checked: 2 }),
		evidence: '[]',
		evaluation_as_of: '2026-08-29T00:00:00Z'
	};
	const secondScore = { ...score, atlas_id: secondBusiness.atlas_id };

	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('COUNT(*)')) return { n: 2 };
					return null;
				},
				all: async () => {
					if (sql.includes('SELECT key, value FROM meta')) {
						coverageReads.value += 1;
						return {
							results: [
								{
									key: 'coverage_applicable',
									value: JSON.stringify([
										'example.checked',
										'example.not-checked',
										'example.pending'
									])
								},
								{ key: 'coverage_checked', value: JSON.stringify(['example.checked']) }
							]
						};
					}
					if (sql.includes('FROM businesses_fts')) {
						return { results: [business, secondBusiness] };
					}
					if (sql.includes('FROM identifiers')) return { results: [] };
					if (sql.includes('FROM scores')) return { results: [score, secondScore] };
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

describe('search result shaping', () => {
	it('places the score coverage sentence in each formality result', async () => {
		const coverageReads = { value: 0 };
		const db = searchDb(coverageReads);
		const response = await searchBusinesses(
			{ db, statementsDb: db, scoresDb: db },
			{
				q: 'Example Hardware'
			}
		);

		expect(response.results[0].formality).toMatchObject({
			summary: expect.stringContaining('Formality 25 of 55 checkable'),
			coverage_summary: 'found in 1 of 2 checked; 2 not yet checked'
		});
		expect(response.results[0]).toMatchObject({
			coverage: {
				applicable: ['example.checked', 'example.not-checked', 'example.pending'],
				checked: ['example.checked'],
				found_in: ['example.checked'],
				not_yet_checked: ['example.not-checked', 'example.pending']
			},
			coverage_summary: 'found in 1 of 1 checked; 2 not yet checked'
		});
		expect(response.results).toHaveLength(2);
		expect(coverageReads.value).toBe(1);
	});
});

describe('coverage per country', () => {
	function db(): D1Database {
		const base = {
			name_normalised: 'EXAMPLE',
			name_variants: '[]',
			entity_kind: 'company',
			sector_category: null,
			sector_nature: null,
			district: null,
			division: null,
			first_seen: '2026-08-01',
			last_seen: '2026-08-29',
			scores: '{}'
		};
		const ugandan = {
			...base,
			atlas_id: 'atlas-ug-1',
			country: 'UG',
			canonical_name: 'Example Uganda Ltd',
			coverage: JSON.stringify({ found_in: ['example.ug.checked'] })
		};
		const kenyan = {
			...base,
			atlas_id: 'atlas-ke-1',
			country: 'KE',
			canonical_name: 'Example Kenya Ltd',
			coverage: JSON.stringify({ found_in: ['example.ke.checked'] })
		};
		return {
			prepare: (sql: string) => ({
				bind: () => ({
					first: async () => {
						if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
						if (sql.includes('COUNT(*)')) return { n: 2 };
						return null;
					},
					all: async () => {
						if (sql.includes('SELECT key, value FROM meta')) {
							return {
								results: [
									{
										key: 'coverage_applicable',
										value: '["example.ug.checked","example.ug.pending"]'
									},
									{ key: 'coverage_checked', value: '["example.ug.checked"]' },
									{
										key: 'coverage_applicable:UG',
										value: '["example.ug.checked","example.ug.pending"]'
									},
									{ key: 'coverage_checked:UG', value: '["example.ug.checked"]' },
									{
										key: 'coverage_applicable:KE',
										value: '["example.ke.checked","example.ke.pending"]'
									},
									{ key: 'coverage_checked:KE', value: '["example.ke.checked"]' }
								]
							};
						}
						if (sql.includes('FROM businesses_fts')) return { results: [ugandan, kenyan] };
						return { results: [] };
					}
				})
			})
		} as unknown as D1Database;
	}

	it('judges each business against the registers of its own country', async () => {
		const database = db();
		const response = await searchBusinesses(
			{ db: database, statementsDb: database, scoresDb: database },
			{ q: 'Example' }
		);
		expect(response.results.map((item) => item.coverage)).toEqual([
			{
				applicable: ['example.ug.checked', 'example.ug.pending'],
				checked: ['example.ug.checked'],
				found_in: ['example.ug.checked'],
				not_yet_checked: ['example.ug.pending']
			},
			{
				applicable: ['example.ke.checked', 'example.ke.pending'],
				checked: ['example.ke.checked'],
				found_in: ['example.ke.checked'],
				not_yet_checked: ['example.ke.pending']
			}
		]);
	});
});
