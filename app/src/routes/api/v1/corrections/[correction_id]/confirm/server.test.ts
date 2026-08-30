import { describe, expect, it } from 'vitest';
import { hashConfirmationToken } from '$lib/confirmation';
import { POST } from './+server';

interface RequestState {
	request_id: string;
	status: string;
	expires_at: string;
	confirmation_token_hash: string;
	confirmed_at?: string;
}

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(state: RequestState): { db: D1Database; batches: FakeStatement[][] } {
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				sql,
				bindings,
				first: async () =>
					bindings[0] === state.request_id && bindings[1] === state.confirmation_token_hash
						? state
						: null
			})
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			state.status = 'confirmed';
			state.confirmed_at = String(statements[0].bindings[0]);
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

describe('correction confirmation API', () => {
	it('confirms in place and appends a status event without storing the plain token', async () => {
		const token = 'example-correction-token';
		const state: RequestState = {
			request_id: 'correction_example_1',
			status: 'unconfirmed',
			expires_at: '2999-01-01T00:00:00.000Z',
			confirmation_token_hash: await hashConfirmationToken(token)
		};
		const { db, batches } = database(state);
		const response = await POST({
			params: { correction_id: state.request_id },
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/example', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token })
			})
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			correction_id: 'correction_example_1',
			status: 'confirmed'
		});
		expect(state.status).toBe('confirmed');
		expect(batches[0][0].bindings).toContain(await hashConfirmationToken(token));
		expect(batches[0][1].bindings).toContain('correction');
		expect(JSON.stringify(batches)).not.toContain(token);
	});
});
