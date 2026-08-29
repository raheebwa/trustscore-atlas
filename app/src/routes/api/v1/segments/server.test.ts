import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function database(): D1Database {
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
					if (sql.includes('GROUP BY b.division')) {
						return { results: [{ division: 'Central Division', count: 2 }] };
					}
					if (sql.includes('FROM businesses b') && sql.includes('JOIN scores')) {
						return {
							results: [
								{
									atlas_id: 'atlas-example-1',
									canonical_name: 'Example Hardware Supplies Ltd',
									district: 'Example District',
									division: 'Central Division',
									sector_category: 'Trade',
									sector_nature: 'Hardware',
									formality_value: 70,
									formality_max: 100,
									formality_checkable: 100,
									formality_unknown: 0,
									formality_version: 1,
									formality_evaluation_as_of: '2026-08-29T09:05:00Z'
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

describe('segments API', () => {
	it('returns division counts, ranked candidates, and a filter-preserving search link', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/segments?category=Trade&district=Example%20District'
		);
		const response = await GET({
			platform: { env: { DB: database() } },
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
