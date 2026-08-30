// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

function segmentsDatabase(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => ({ value: 'regen-example-1' }),
				all: async () => {
					if (sql.includes('DISTINCT country')) return { results: [{ country: 'UG' }] };
					if (sql.includes('GROUP BY district')) {
						return { results: [{ key: 'Kampala', count: 30 }] };
					}
					if (sql.includes('GROUP BY register')) {
						return { results: [{ key: 'kcca.businesses', count: 30 }] };
					}
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

describe('explore page load', () => {
	it('offers the filter value sets alongside the breakdowns', async () => {
		const db = segmentsDatabase();
		const data = (await load({
			cookies: { get: () => undefined },
			platform: { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } },
			url: new URL('https://atlas.example.invalid/explore')
		} as never)) as { facets: Record<string, { value: string; count: number }[]> };

		expect(data.facets.district).toEqual([{ value: 'Kampala', count: 30 }]);
		expect(data.facets.register).toEqual([{ value: 'kcca.businesses', count: 30 }]);
	});
});
