// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function segmentsDatabase(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => ({ value: 'regen-example-1' }),
				all: async () => {
					expect(bindings[0]).toBe('KE');
					if (sql.includes('GROUP BY district')) {
						return { results: [{ key: 'Nairobi', count: 40 }] };
					}
					if (sql.includes('GROUP BY register')) {
						return { results: [{ key: 'cbk.licensed_banks', count: 61 }] };
					}
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

function platform(): unknown {
	const db = segmentsDatabase();
	return { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } };
}

describe('facets API', () => {
	it('returns the filter value sets for the requested country', async () => {
		const request = new Request('https://atlas.example.invalid/api/v1/facets?country=ke');
		const response = await GET({
			platform: platform(),
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			country: 'KE',
			regeneration_id: 'regen-example-1',
			facets: {
				district: [{ value: 'Nairobi', count: 40 }],
				register: [{ value: 'cbk.licensed_banks', count: 61 }]
			}
		});
	});

	it('refuses a country that is not a two-letter code', async () => {
		const request = new Request('https://atlas.example.invalid/api/v1/facets?country=Kenya');
		const response = await GET({
			platform: platform(),
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(400);
	});
});
