import { describe, expect, it } from 'vitest';
import { buildExploreFilter, exploreSegments, exploreCsv } from './explore';
import type { AtlasDatabases } from './platform';

describe('buildExploreFilter', () => {
	it('uses the rollup rows for nature and register when they are not filtered', () => {
		const filter = buildExploreFilter({ category: 'GENERAL', district: 'Kampala' });
		expect(filter.whereClause).toContain('sector_category = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('district = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('sector_nature IS NULL');
		expect(filter.whereClause).toContain('register IS NULL');
		expect(filter.whereClause).not.toContain('GENERAL');
		expect(filter.bindings).toEqual(['GENERAL', 'Kampala']);
	});

	it('binds nature and register when they are filtered', () => {
		const filter = buildExploreFilter({ nature: 'Hardware', present_in: 'kcca.businesses' });
		expect(filter.whereClause).toContain('sector_nature = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain('register = ?');
		expect(filter.bindings).toEqual(['Hardware', 'kcca.businesses']);
	});
});

function fakeDatabases(calls: string[]): AtlasDatabases {
	const rowsFor = (sql: string) => {
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
					first: async () => (sql.includes('FROM meta') ? { value: 'regen-example-1' } : { n: 4 }),
					all: async () => ({ results: rowsFor(sql) })
				})
			};
		}
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('exploreSegments', () => {
	it('returns totals and breakdowns from the segments table only', async () => {
		const calls: string[] = [];
		const response = await exploreSegments(fakeDatabases(calls), { category: 'GENERAL ' });
		expect(calls.filter((sql) => sql.includes('FROM businesses'))).toEqual([]);
		expect(response).toMatchObject({
			filters: { category: 'GENERAL' },
			total_count: 4,
			counts_by_district: [
				{ district: 'Kampala', count: 3 },
				{ district: null, count: 1 }
			],
			counts_by_division: [],
			counts_by_register: [{ register: 'kcca.businesses', count: 4 }],
			counts_by_nature: [{ key: 'Hardware', count: 4 }],
			search_link: '/search?category=GENERAL',
			export_link: '/api/v1/explore?category=GENERAL&format=csv'
		});
	});

	it('breaks a chosen district down by division and lists categories when none is chosen', async () => {
		const response = await exploreSegments(fakeDatabases([]), { district: 'Kampala' });
		expect(response.counts_by_division).toEqual([{ division: 'Central Division', count: 3 }]);
		expect(response.counts_by_category).toEqual([{ key: 'GENERAL', count: 4 }]);
		expect(response.counts_by_nature).toBeUndefined();
	});
});

describe('exploreCsv', () => {
	it('writes one line per district with quoting and an unknown label for null', () => {
		const csv = exploreCsv({
			filters: {},
			total_count: 4,
			counts_by_district: [
				{ district: 'Kampala', count: 3 },
				{ district: null, count: 1 }
			],
			counts_by_division: [],
			counts_by_register: [],
			search_link: '/search',
			export_link: '/api/v1/explore?format=csv'
		});
		expect(csv).toBe('district,business_count\r\nKampala,3\r\n(unknown),1\r\n');
	});
});
