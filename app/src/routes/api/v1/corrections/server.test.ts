import { describe, expect, it } from 'vitest';
import { hashConfirmationToken } from '$lib/confirmation';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(): { db: D1Database; prepared: FakeStatement[]; batches: FakeStatement[][] } {
	const prepared: FakeStatement[] = [];
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const statement = { sql, bindings };
				prepared.push(statement);
				return {
					...statement,
					first: async () =>
						sql.includes('FROM businesses') ? { atlas_id: 'atlas-example-1' } : null
				};
			}
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, prepared, batches };
}

function request(field = 'canonical_name'): Request {
	return new Request('https://atlas.example.invalid/api/v1/corrections', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			atlas_id: 'atlas-example-1',
			field,
			value: 'Example Workshop Limited',
			evidence_url: 'https://example.org/evidence/example-workshop'
		})
	});
}

describe('corrections API', () => {
	it('stores an unconfirmed correction with a hashed 24-hour token and event', async () => {
		const { db, prepared, batches } = database();
		const before = Date.now();
		const response = await POST({ platform: { env: { DB: db } }, request: request() } as never);
		const body = (await response.json()) as {
			correction_id: string;
			status: string;
			confirm_url: string;
			expires_at: string;
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			correction_id: expect.stringMatching(/^correction_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/correct\/correction_.+\?token=[a-f0-9]{64}$/)
		});
		expect(Date.parse(body.expires_at) - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
		expect(Date.parse(body.expires_at) - before).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
		expect(prepared[0].sql).not.toContain('atlas-example-1');
		expect(prepared[0].bindings).toEqual(['atlas-example-1']);

		const plainToken = new URL(body.confirm_url, 'https://atlas.example.invalid').searchParams.get(
			'token'
		)!;
		expect(batches[0][0].bindings).toContain(await hashConfirmationToken(plainToken));
		expect(batches[0][0].bindings).not.toContain(plainToken);
		expect(batches[0][0].bindings).toContain('unconfirmed');
		expect(batches[0][1].bindings).toContain('correction');
		expect(JSON.stringify(batches)).not.toContain(plainToken);
	});

	it('refuses identifier corrections before any database access', async () => {
		const { db, prepared, batches } = database();
		const response = await POST({
			platform: { env: { DB: db } },
			request: request('identifiers')
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'field_not_correctable',
			message:
				'Identifiers, register statuses and licence standing can only be disputed through report_issue.'
		});
		expect(prepared).toHaveLength(0);
		expect(batches).toHaveLength(0);
	});
});
