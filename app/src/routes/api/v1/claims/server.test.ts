import { describe, expect, it } from 'vitest';
import { POST } from './+server';

function database(): { db: D1Database; batches: unknown[][] } {
	const batches: unknown[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					if (sql.includes('canonical_name')) {
						return { canonical_name: 'Example Hardware Supplies Ltd' };
					}
					return null;
				},
				bindings
			})
		}),
		batch: async (statements: { bindings?: unknown[] }[]) => {
			batches.push(statements.map((statement) => statement.bindings ?? []));
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

describe('claims API', () => {
	it('records a request and an append-only event with parameter bindings', async () => {
		const { db, batches } = database();
		const request = new Request('https://atlas.example.invalid/api/v1/claims', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				atlas_id: 'atlas-example-1',
				claimant_role: 'authorised representative'
			})
		});
		const response = await POST({ platform: { env: { DB: db } }, request } as never);

		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			claim_id: expect.stringMatching(/^claim_/),
			status: 'requested',
			verification_steps: [
				'Place a verification string on the registered website or official social profile.',
				'Reply from an email address on the domain named in a register.',
				'Start a per-record confirmation with URSB or URA when available.'
			]
		});
		expect(batches).toHaveLength(1);
		expect(batches[0].flat()).toContain('atlas-example-1');
		expect(batches[0].flat()).toContain('authorised representative');
	});
});
