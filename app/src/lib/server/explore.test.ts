import { describe, expect, it } from 'vitest';
import { RegenerationInProgressError } from './atlas';
import { buildExploreFilter, exploreCsv, exploreSegments } from './explore';
import type { AtlasDatabases } from './platform';

describe('buildExploreFilter', () => {
	it('always scopes to one country and uses the rollup rows for nature and register', () => {
		const filter = buildExploreFilter({ category: 'GENERAL', district: 'Kampala' });
		expect(filter.whereClause).toContain('country = ?');
		expect(filter.whereClause).toContain('sector_category = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('district = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('sector_nature IS NULL');
		expect(filter.whereClause).toContain('register IS NULL');
		expect(filter.whereClause).not.toContain('GENERAL');
		expect(filter.bindings).toEqual(['UG', 'GENERAL', 'Kampala']);
	});

	it('binds nature, register and an explicit country when they are filtered', () => {
		const filter = buildExploreFilter({
			country: 'ke',
			nature: 'Hardware',
			present_in: 'cbk.licensed_banks'
		});
		expect(filter.whereClause).toContain('sector_nature = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('register = ?');
		expect(filter.bindings).toEqual(['KE', 'Hardware', 'cbk.licensed_banks']);
	});
});

function fakeDatabases(calls: string[], liveIds = ['regen-example-1']): AtlasDatabases {
	let metaReads = 0;
	const rowsFor = (sql: string) => {
		if (sql.includes('DISTINCT country')) return [{ country: 'UG' }, { country: 'KE' }];
		if (sql.includes('GROUP BY district')) {
			return [
				{ key: 'Kampala', count: 3 },
				{ key: null, count: 1 }
			];
		}
		if (sql.includes('GROUP BY division')) return [{ key: 'Central Division', count: 3 }];
		if (sql.includes('GROUP BY register')) return [{ key: 'kcca.businesses', count: 4 }];
		if (sql.includes('GROUP BY sector_nature')) return [{ key: 'Hardware', count: 4 }];
		if (sql.includes('GROUP BY sector_category')) return [{ key: 'GENERAL', count: 4 }];
		return [];
	};
	const db = {
		prepare: (sql: string) => {
			calls.push(sql);
			return {
				bind: () => ({
					first: async () => {
						if (sql.includes('FROM meta')) {
							const value = liveIds[Math.min(metaReads, liveIds.length - 1)];
							metaReads += 1;
							return { value };
						}
						return { n: 4 };
					},
					all: async () => ({ results: rowsFor(sql) })
				})
			};
		}
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('exploreSegments', () => {
	it('returns totals and breakdowns for one country from the segments table only', async () => {
		const calls: string[] = [];
		const response = await exploreSegments(fakeDatabases(calls), { category: 'GENERAL ' });
		expect(calls.filter((sql) => sql.includes('FROM businesses'))).toEqual([]);
		expect(response).toMatchObject({
			filters: { country: 'UG', category: 'GENERAL' },
			countries: ['UG', 'KE'],
			total_count: 4,
			counts_by_district: [
				{ district: 'Kampala', count: 3 },
				{ district: null, count: 1 }
			],
			counts_by_division: [],
			counts_by_register: [{ register: 'kcca.businesses', count: 4 }],
			counts_by_nature: [{ key: 'Hardware', count: 4 }],
			search_link: '/search?category=GENERAL',
			export_link: '/api/v1/explore?country=UG&category=GENERAL&format=csv'
		});
	});

	it('groups case variants together and caps every breakdown', async () => {
		const calls: string[] = [];
		await exploreSegments(fakeDatabases(calls), {});
		const grouped = calls.filter((sql) => sql.includes('GROUP BY'));
		expect(grouped.length).toBeGreaterThan(0);
		for (const sql of grouped) {
			expect(sql).toMatch(/GROUP BY \w+ COLLATE NOCASE/);
			expect(sql).toMatch(/LIMIT \d+/);
		}
	});

	it('breaks a chosen district down by division and lists categories when none is chosen', async () => {
		const response = await exploreSegments(fakeDatabases([]), { district: 'Kampala' });
		expect(response.counts_by_division).toEqual([{ division: 'Central Division', count: 3 }]);
		expect(response.counts_by_category).toEqual([{ key: 'GENERAL', count: 4 }]);
		expect(response.counts_by_nature).toBeUndefined();
	});

	it('refuses to answer when the live regeneration changed while it was reading', async () => {
		await expect(
			exploreSegments(fakeDatabases([], ['regen-a', 'regen-b']), {})
		).rejects.toBeInstanceOf(RegenerationInProgressError);
	});
});

describe('exploreCsv', () => {
	it('writes one line per district, quoting and neutralising spreadsheet formulas', () => {
		const csv = exploreCsv({
			filters: { country: 'UG' },
			countries: ['UG'],
			total_count: 5,
			counts_by_district: [
				{ district: 'Kampala', count: 3 },
				{ district: null, count: 1 },
				{ district: '=1+1', count: 1 }
			],
			counts_by_division: [],
			counts_by_register: [],
			search_link: '/search',
			export_link: '/api/v1/explore?country=UG&format=csv'
		});
		expect(csv).toBe('district,business_count\r\nKampala,3\r\n(unknown),1\r\n"\'=1+1",1\r\n');
	});
});

describe('exploreSegments with a cache', () => {
	it('answers repeated filter sets from KV within one regeneration', async () => {
		const { exploreSegmentsCached } = await import('./explore');
		const store = new Map<string, string>();
		const cache = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			}
		} as unknown as KVNamespace;
		const calls: string[] = [];
		const databases = fakeDatabases(calls);
		const first = await exploreSegmentsCached(databases, cache, { district: 'Kampala ' });
		const queriesAfterFirst = calls.filter((sql) => sql.includes('FROM segments')).length;
		const second = await exploreSegmentsCached(databases, cache, { district: 'Kampala' });
		expect(second).toEqual(first);
		expect(calls.filter((sql) => sql.includes('FROM segments')).length).toBe(queriesAfterFirst);
		expect([...store.keys()]).toEqual(['explore:regen-example-1:UG|||Kampala||']);
	});
});
