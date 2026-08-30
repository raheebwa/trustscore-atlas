// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(): { db: D1Database; batches: FakeStatement[][] } {
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				sql,
				bindings,
				first: async () =>
					sql.includes('canonical_name')
						? { canonical_name: 'Example Hardware Supplies Ltd' }
						: null
			})
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

describe('claims API', () => {
	it('creates an unconfirmed request with a once-returned plain token', async () => {
		const { db, batches } = database();
		const before = Date.now();
		const request = new Request('https://atlas.example.invalid/api/v1/claims', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				atlas_id: 'atlas-example-1',
				claimant_role: 'authorised representative'
			})
		});
		const response = await POST({ platform: { env: { DB: db } }, request } as never);
		const body = (await response.json()) as {
			claim_id: string;
			status: string;
			confirm_url: string;
			expires_at: string;
			verification_steps: string[];
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			claim_id: expect.stringMatching(/^claim_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/claim\/claim_.+\?token=[a-f0-9]{64}$/),
			verification_steps: [
				'Place a verification string on the registered website or official social profile.',
				'Reply from an email address on the domain named in a register.',
				'Start a per-record confirmation with URSB or URA when available.'
			]
		});
		expect(Date.parse(body.expires_at) - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
		expect(Date.parse(body.expires_at) - before).toBeLessThan(24 * 60 * 60 * 1000 + 1000);

		const plainToken = new URL(body.confirm_url, 'https://atlas.example.invalid').searchParams.get(
			'token'
		)!;
		const claimBindings = batches[0][0].bindings;
		expect(claimBindings).toContain('unconfirmed');
		expect(claimBindings).not.toContain(plainToken);
		expect(claimBindings).toContain(await hashClaimConfirmationToken(plainToken));
		expect(batches[0][1].bindings).toContain('unconfirmed');
		expect(JSON.stringify(batches)).not.toContain(plainToken);
	});

	it('creates a confirmed request directly from the claim page form', async () => {
		const { db, batches } = database();
		const form = new FormData();
		form.set('atlas_id', 'atlas-example-1');
		form.set('claimant_role', 'owner or director');
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/claims', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/claim/atlas-example-1?confirmation=complete');
		expect(batches[0][0].bindings).toContain('confirmed');
		expect(batches[0][0].bindings.at(-1)).toBeNull();
		expect(batches[0][1].bindings).toContain('confirmed');
	});
});
