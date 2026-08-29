import { describe, expect, it } from 'vitest';
import { GET } from './+server';

const scoreRow = {
	atlas_id: 'atlas-example-1',
	rubric: 'formality',
	version: 1,
	regeneration_id: 'regen-example-1',
	value: 25,
	max: 100,
	checkable: 55,
	unknown: 45,
	coverage: JSON.stringify({ applicable: 3, checked: 1, found_in: 1, not_yet_checked: 2 }),
	evidence: JSON.stringify([
		{ predicate: 'trading_licence', points: 25, statement_ids: ['statement-example-1'] },
		{ predicate: 'legal_register_presence', points: 0, reason: 'not checked' }
	]),
	evaluation_as_of: '2026-08-29T09:05:00Z'
};

function database(
	kind: 'main' | 'statements' | 'scores',
	storedScore: typeof scoreRow | null = scoreRow
): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('SELECT 1 AS ok')) return { ok: 1 };
					if (kind === 'scores' && sql.includes('FROM scores')) {
						expect(bindings).toContain('formality');
						return storedScore;
					}
					return null;
				}
			})
		})
	} as unknown as D1Database;
}

describe('scores API', () => {
	it('returns the requested stored score without exposing database details', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example-1/scores?rubric=formality'
		);
		const response = await GET({
			platform: {
				env: {
					DB: database('main'),
					DB_STATEMENTS: database('statements'),
					DB_SCORES: database('scores')
				}
			},
			params: { atlas_id: 'atlas-example-1' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			rubric: 'formality',
			version: 1,
			value: 25,
			checkable: 55,
			unknown: 45,
			unknown_predicates: ['legal_register_presence']
		});
	});

	it('returns a safe 404 object for an unknown rubric', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example-1/scores?rubric=formality'
		);
		const response = await GET({
			platform: {
				env: {
					DB: database('main'),
					DB_STATEMENTS: database('statements'),
					DB_SCORES: database('scores', null)
				}
			},
			params: { atlas_id: 'atlas-example-1' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'rubric_not_found' });
	});
});
