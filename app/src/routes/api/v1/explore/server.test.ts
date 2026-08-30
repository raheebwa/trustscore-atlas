import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function database(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => (sql.includes('FROM meta') ? { value: 'regen-example-1' } : { n: 5 }),
				all: async () => ({
					results: sql.includes('GROUP BY district')
						? [
								{ key: 'Kampala', count: 4 },
								{ key: null, count: 1 }
							]
						: []
				})
			})
		})
	} as unknown as D1Database;
}

function call(query: string) {
	const request = new Request(`https://atlas.example.invalid/api/v1/explore${query}`);
	const db = database();
	return GET({
		platform: { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } },
		request,
		url: new URL(request.url)
	} as never);
}

describe('explore API', () => {
	it('returns the segment breakdown as JSON with an export link', async () => {
		const response = await call('?district=Kampala');
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			total_count: 5,
			counts_by_district: [
				{ district: 'Kampala', count: 4 },
				{ district: null, count: 1 }
			],
			export_link: '/api/v1/explore?district=Kampala&format=csv'
		});
	});

	it('exports the district breakdown as CSV', async () => {
		const response = await call('?format=csv');
		expect(response.headers.get('content-type')).toContain('text/csv');
		expect(await response.text()).toBe('district,business_count\r\nKampala,4\r\n(unknown),1\r\n');
	});

	it('rejects an unknown format', async () => {
		expect((await call('?format=xml')).status).toBe(400);
	});
});
