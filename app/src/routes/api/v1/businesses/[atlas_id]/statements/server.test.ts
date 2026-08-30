// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function mainDb(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-main' };
					return { canonical_name: 'Example Hardware Supplies Ltd' };
				}
			})
		})
	} as unknown as D1Database;
}

function statementsDb(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-main' };
					return null;
				},
				all: async () => {
					throw new Error('Statement rows must not be read during a regeneration mismatch');
				}
			})
		})
	} as unknown as D1Database;
}

function scoresDb(): D1Database {
	return {
		prepare: () => ({
			bind: () => ({ first: async () => ({ value: 'regen-scores' }) })
		})
	} as unknown as D1Database;
}

describe('statements API regeneration consistency', () => {
	it('returns the safe 503 response when live regeneration ids differ', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example/statements'
		);
		const response = await GET({
			platform: {
				env: {
					DB: mainDb(),
					DB_STATEMENTS: statementsDb(),
					DB_SCORES: scoresDb()
				}
			},
			params: { atlas_id: 'atlas-example' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'regeneration in progress' });
	});
});
