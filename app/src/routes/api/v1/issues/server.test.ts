import { describe, expect, it } from 'vitest';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(): { db: D1Database; batches: FakeStatement[][] } {
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({ sql, bindings })
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

describe('issues API', () => {
	it('stores an unconfirmed issue with optional scope values', async () => {
		const { db, batches } = database();
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/issues', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					source: 'example.register',
					description: 'The example source date appears incomplete.'
				})
			})
		} as never);
		const body = (await response.json()) as {
			issue_id: string;
			status: string;
			confirm_url: string;
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			issue_id: expect.stringMatching(/^issue_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/report\/issue_.+\?token=[a-f0-9]{64}$/)
		});
		expect(batches[0][0].bindings).toContain(null);
		expect(batches[0][0].bindings).toContain('example.register');
		expect(batches[0][0].bindings).toContain('The example source date appears incomplete.');
		expect(batches[0][1].bindings).toContain('issue');
	});
});
