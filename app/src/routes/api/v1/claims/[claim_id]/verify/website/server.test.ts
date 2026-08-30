// SPDX-License-Identifier: Apache-2.0
/**
 * The claimant holds a link rather than an account, so the token is the whole of the
 * authorisation. These tests pin what that means: the wrong token learns nothing, a challenge
 * belonging to another claim cannot be run with this one's token, and an already verified claim
 * is not verifiable twice.
 */

import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

const TOKEN = 'a-real-looking-token';

async function platform(options: {
	confirmationToken?: string | null;
	verifiedAt?: string | null;
	challengeBelongs?: boolean;
	status?: string;
	claimExpiresAt?: string | null;
}) {
	const hashed = await hashClaimConfirmationToken(TOKEN);
	const db = {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM claims')) {
						return {
							claim_id: 'claim_1',
							atlas_id: 'atlas-example-1',
							status: options.status ?? 'confirmed',
							expires_at:
								options.claimExpiresAt === undefined
									? '2999-01-01T00:00:00.000Z'
									: options.claimExpiresAt,
							confirmation_token:
								options.confirmationToken === undefined ? hashed : options.confirmationToken,
							verified_at: options.verifiedAt ?? null
						};
					}
					if (sql.includes('FROM claim_challenges WHERE challenge_id = ? AND claim_id = ?')) {
						return options.challengeBelongs === false ? null : { challenge_id: 'chal_1' };
					}
					// The attempt itself reads the challenge row; an expired one ends the attempt
					// without a network call, which keeps this test off the network.
					return {
						challenge_id: 'chal_1',
						claim_id: 'claim_1',
						method: 'website_string',
						target: 'https://example.ug',
						challenge_value: 'atlas-verify-abc',
						expires_at: '2000-01-01T00:00:00Z',
						consumed_at: null,
						attempts: 0
					};
				},
				run: async () => ({ meta: { changes: 1 } })
			})
		})
	} as unknown as D1Database;
	return { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } };
}

async function call(body: unknown, options = {}) {
	const request = new Request(
		'https://atlas.example.invalid/api/v1/claims/claim_1/verify/website',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}
	);
	return POST({
		params: { claim_id: 'claim_1' },
		platform: await platform(options),
		request
	} as never);
}

async function callForm(fields: Record<string, string>, options = {}) {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return POST({
		params: { claim_id: 'claim_1' },
		platform: await platform(options),
		request: new Request('https://atlas.example.invalid/api/v1/claims/claim_1/verify/website', {
			method: 'POST',
			body: form
		})
	} as never);
}

describe('website verification endpoint', () => {
	it('refuses a request with no token or no challenge', async () => {
		expect((await call({ challenge_id: 'chal_1' })).status).toBe(400);
		expect((await call({ token: TOKEN })).status).toBe(400);
	});

	it('says only "not found" to a wrong token, so it cannot be used to probe for claims', async () => {
		const response = await call(
			{ token: 'not-the-token', challenge_id: 'chal_1' },
			{ confirmationToken: await hashClaimConfirmationToken('something-else') }
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'claim_not_found' });
	});

	it('refuses a challenge that belongs to another claim', async () => {
		const response = await call(
			{ token: TOKEN, challenge_id: 'chal_from_elsewhere' },
			{ challengeBelongs: false }
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'challenge_not_found' });
	});

	it('answers plainly when the claim is already verified, without another attempt', async () => {
		const response = await call(
			{ token: TOKEN, challenge_id: 'chal_1' },
			{ verifiedAt: '2026-08-30T00:00:00Z' }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'verified', outcome: 'already_verified' });
	});

	it("reports the verifier's own reason when the attempt does not succeed", async () => {
		const response = await call({ token: TOKEN, challenge_id: 'chal_1' });
		const body = (await response.json()) as { status: string; outcome: string };

		expect(response.status).toBe(200);
		expect(body.status).toBe('not_verified');
		expect(body.outcome).toBe('expired');
	});

	// The claimant presses a button on a page, so the answer has to be that page again with the
	// attempt's outcome on it, never a JSON body rendered as a document.
	it('sends a page form back to the claim page carrying its own link', async () => {
		const response = await callForm({ token: TOKEN, challenge_id: 'chal_1' });

		expect(response.status).toBe(303);
		const location = new URL(
			response.headers.get('location') ?? '',
			'https://atlas.example.invalid'
		);
		expect(location.pathname).toBe('/claim/atlas-example-1');
		expect(location.searchParams.get('claim')).toBe('claim_1');
		expect(location.searchParams.get('token')).toBe(TOKEN);
		expect(location.searchParams.get('confirmation')).toBe('complete');
	});

	it('refuses a page form with no token without redirecting anywhere', async () => {
		expect((await callForm({ challenge_id: 'chal_1' })).status).toBe(400);
	});

	/**
	 * The token is the whole of the authorisation, so what bounds it is the claim itself. A claim
	 * that was never confirmed, or whose window has closed, is not verifiable with it.
	 */
	it('refuses to verify a claim that was never confirmed', async () => {
		const response = await call(
			{ token: TOKEN, challenge_id: 'chal_1' },
			{ status: 'unconfirmed' }
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'claim_not_confirmed' });
	});

	it('refuses to verify once the claim window has closed', async () => {
		const response = await call(
			{ token: TOKEN, challenge_id: 'chal_1' },
			{ claimExpiresAt: '2000-01-01T00:00:00.000Z' }
		);

		expect(response.status).toBe(410);
		expect(await response.json()).toEqual({ error: 'claim_window_closed' });
	});

	it('treats an unreadable claim window as closed', async () => {
		const response = await call(
			{ token: TOKEN, challenge_id: 'chal_1' },
			{ claimExpiresAt: 'not a date' }
		);

		expect(response.status).toBe(410);
	});
});
