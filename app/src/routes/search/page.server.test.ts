import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

function segmentsDatabase(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => ({ value: 'regen-example-1' }),
				all: async () => {
					if (sql.includes('GROUP BY district')) {
						return { results: [{ key: 'Kampala', count: 30 }] };
					}
					if (sql.includes('GROUP BY sector_category')) {
						return { results: [{ key: 'GENERAL', count: 30 }] };
					}
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

describe('search page load', () => {
	it('offers the filter value sets so the controls list only published values', async () => {
		const db = segmentsDatabase();
		const data = (await load({
			platform: { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } },
			url: new URL('https://atlas.example.invalid/search')
		} as never)) as { facets: Record<string, { value: string; count: number }[]> };

		expect(data.facets.district).toEqual([{ value: 'Kampala', count: 30 }]);
		expect(data.facets.sector_category).toEqual([{ value: 'GENERAL', count: 30 }]);
		expect(data.facets.division).toEqual([]);
	});
});
