// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(): { db: D1Database; batches: FakeStatement[][]; statements: FakeStatement[] } {
	const batches: FakeStatement[][] = [];
	const statements: FakeStatement[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				sql,
				bindings,
				first: async () =>
					sql.includes('canonical_name')
						? { canonical_name: 'Example Hardware Supplies Ltd' }
						: null,
				run: async () => {
					statements.push({ sql, bindings });
					return { meta: { changes: 1 } };
				}
			})
		}),
		batch: async (batched: FakeStatement[]) => {
			batches.push(batched);
			return [];
		}
	} as unknown as D1Database;
	return { db, batches, statements };
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
		// The claimant leaves holding their own claim and its token: without them they could never
		// come back to verify, and there is no account to come back to.
		const location = new URL(
			response.headers.get('location') ?? '',
			'https://atlas.example.invalid'
		);
		expect(location.pathname).toBe('/claim/atlas-example-1');
		expect(location.searchParams.get('confirmation')).toBe('complete');
		expect(location.searchParams.get('claim')).toMatch(/^claim_[0-9a-f]{32}$/);
		expect(location.searchParams.get('token')?.length).toBeGreaterThan(20);
		expect(batches[0][0].bindings).toContain('confirmed');
		// The stored value is the hash, never the token itself: the claimant holds the only copy.
		const storedToken = batches[0][0].bindings.at(-1);
		expect(typeof storedToken).toBe('string');
		expect(storedToken).not.toBe(location.searchParams.get('token'));
		expect(batches[0][1].bindings).toContain('confirmed');
	});

	/**
	 * A claim row is durable and a claim_event cannot be deleted, so an address that can never be
	 * checked has to be refused before either is written, not after.
	 */
	it('refuses an address the verifier could never reach before writing anything', async () => {
		const { db, batches } = database();
		const form = new FormData();
		form.set('atlas_id', 'atlas-example-1');
		form.set('claimant_role', 'owner or director');
		form.set('verification_method', 'website_string');
		form.set('website_url', 'http://localhost/about');
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/claims', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(400);
		expect(batches).toHaveLength(0);
	});

	it('refuses a website address offered with a method it cannot run', async () => {
		const { db, batches } = database();
		const form = new FormData();
		form.set('atlas_id', 'atlas-example-1');
		form.set('claimant_role', 'owner or director');
		form.set('verification_method', 'domain_email');
		form.set('website_url', 'https://example.co.ug');
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/claims', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(400);
		expect(batches).toHaveLength(0);
	});

	it('records the method on the claim it issued a challenge for', async () => {
		const { db, batches, statements } = database();
		const form = new FormData();
		form.set('atlas_id', 'atlas-example-1');
		form.set('claimant_role', 'owner or director');
		form.set('verification_method', 'website_string');
		form.set('website_url', 'https://example.co.ug/about');
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/claims', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(303);
		expect(batches[0][0].bindings).toContain('website_string');
		const challenge = statements.find((entry) =>
			entry.sql.includes('INSERT INTO claim_challenges')
		);
		expect(challenge?.bindings).toContain('https://example.co.ug');
	});
});
