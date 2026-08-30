// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function mainDatabase(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('COUNT(*)')) {
						expect(bindings).toContain('Trade');
						return { n: 2 };
					}
					return null;
				},
				all: async () => {
					if (sql.includes('FROM scores')) {
						throw new Error('Score rows must not be read from the main database');
					}
					if (sql.includes('GROUP BY b.division')) {
						return { results: [{ division: 'Central Division', count: 2 }] };
					}
					if (sql.includes('FROM businesses b')) {
						return {
							results: [
								{
									atlas_id: 'atlas-example-1',
									canonical_name: 'Example Hardware Supplies Ltd',
									district: 'Example District',
									division: 'Central Division',
									sector_category: 'Trade',
									sector_nature: 'Hardware',
									scores: JSON.stringify({
										formality: {
											value: 70,
											max: 100,
											checkable: 100,
											unknown: 0,
											version: 1
										}
									})
								}
							]
						};
					}
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

function pointerDatabase(): D1Database {
	return {
		prepare: () => ({
			bind: () => ({ first: async () => ({ value: 'regen-example-1' }) })
		})
	} as unknown as D1Database;
}

function scoresDatabase(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => ({ value: 'regen-example-1' }),
				all: async () => {
					if (sql.includes('FROM businesses')) {
						throw new Error('Business rows must not be read from the scores database');
					}
					return {
						results: [
							{
								atlas_id: 'atlas-example-1',
								value: 70,
								max: 100,
								checkable: 100,
								unknown: 0,
								version: 1,
								evaluation_as_of: '2026-08-29T09:05:00Z'
							}
						]
					};
				}
			})
		})
	} as unknown as D1Database;
}

describe('segments API', () => {
	it('returns division counts, ranked candidates, and a filter-preserving search link', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/segments?category=Trade&district=Example%20District'
		);
		const response = await GET({
			cookies: { get: () => undefined },
			platform: {
				env: {
					DB: mainDatabase(),
					DB_STATEMENTS: pointerDatabase(),
					DB_SCORES: scoresDatabase()
				}
			},
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			total_count: 2,
			counts_by_division: [{ division: 'Central Division', count: 2 }],
			top_candidates: [
				{
					atlas_id: 'atlas-example-1',
					canonical_name: 'Example Hardware Supplies Ltd',
					formality: { value: 70, max: 100 }
				}
			],
			search_link: '/search?category=Trade&district=Example+District'
		});
	});
});
