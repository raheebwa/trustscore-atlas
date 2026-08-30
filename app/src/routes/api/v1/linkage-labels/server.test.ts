import { describe, expect, it } from 'vitest';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(pairExists: boolean): {
	db: D1Database;
	prepared: FakeStatement[];
	batches: FakeStatement[][];
} {
	const prepared: FakeStatement[] = [];
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const statement = { sql, bindings };
				prepared.push(statement);
				return { ...statement, first: async () => (pairExists ? { present: 1 } : null) };
			}
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, prepared, batches };
}

function request(): Request {
	return new Request('https://atlas.example.invalid/api/v1/linkage-labels', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			atlas_id: 'atlas-example-1',
			candidate_atlas_id: 'atlas-example-2',
			verdict: 'non_match'
		})
	});
}

describe('linkage labels API', () => {
	it('stores an unconfirmed label only for an existing candidate pair', async () => {
		const { db, prepared, batches } = database(true);
		const response = await POST({ platform: { env: { DB: db } }, request: request() } as never);
		const body = (await response.json()) as {
			label_id: string;
			status: string;
			confirm_url: string;
			expires_at: string;
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			label_id: expect.stringMatching(/^label_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/label\/label_.+\?token=[a-f0-9]{64}$/)
		});
		expect(prepared[0].sql).toContain('FROM linkage_candidates');
		expect(prepared[0].sql).not.toContain('atlas-example-1');
		expect(prepared[0].bindings).toEqual([
			'atlas-example-1',
			'atlas-example-2',
			'atlas-example-2',
			'atlas-example-1'
		]);
		expect(batches[0][0].bindings).toContain('non_match');
		expect(batches[0][0].bindings).toContain('unconfirmed');
		expect(batches[0][1].bindings).toContain('linkage_label');
	});

	it('does not store a label when the candidate pair does not exist', async () => {
		const { db, batches } = database(false);
		const response = await POST({ platform: { env: { DB: db } }, request: request() } as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'linkage_candidate_not_found' });
		expect(batches).toHaveLength(0);
	});
});
