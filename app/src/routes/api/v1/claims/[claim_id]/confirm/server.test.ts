// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

interface ClaimState {
	claim_id: string;
	atlas_id: string;
	status: string;
	expires_at: string;
	confirmation_token: string;
	confirmed_at?: string;
}

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(claim: ClaimState): { db: D1Database; batches: FakeStatement[][] } {
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				sql,
				bindings,
				first: async () => {
					if (!sql.includes('FROM claims')) return null;
					return bindings[0] === claim.claim_id && bindings[1] === claim.confirmation_token
						? claim
						: null;
				}
			})
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			const update = statements.find((statement) => statement.sql.includes('UPDATE claims'));
			if (update) {
				claim.status = String(update.bindings[0]);
				claim.confirmed_at = String(update.bindings[1]);
			}
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

function confirmationRequest(token: string): Request {
	return new Request('https://atlas.example.invalid/api/v1/claims/claim_example/confirm', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ token })
	});
}

async function claimState(token: string, expiresAt: string): Promise<ClaimState> {
	return {
		claim_id: 'claim_example',
		atlas_id: 'atlas-example-1',
		status: 'unconfirmed',
		expires_at: expiresAt,
		confirmation_token: await hashClaimConfirmationToken(token)
	};
}

describe('claim confirmation API', () => {
	it('confirms an unexpired request with the right token and appends a transition', async () => {
		const token = 'example-confirmation-token';
		const claim = await claimState(token, '2999-01-01T00:00:00.000Z');
		const { db, batches } = database(claim);
		const response = await POST({
			params: { claim_id: claim.claim_id },
			platform: { env: { DB: db } },
			request: confirmationRequest(token)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			claim_id: 'claim_example',
			status: 'confirmed',
			verification_steps: [
				'Place a verification string on the registered website or official social profile.',
				'Reply from an email address on the domain named in a register.',
				'Start a per-record confirmation with URSB or URA when available.'
			]
		});
		expect(claim.status).toBe('confirmed');
		expect(batches).toHaveLength(1);
		expect(batches[0][0].bindings).toContain(await hashClaimConfirmationToken(token));
		expect(batches[0][1].bindings).toContain('confirmed');
		expect(JSON.stringify(batches)).not.toContain(token);
	});

	it('rejects the wrong token without changing the request', async () => {
		const claim = await claimState('right-token', '2999-01-01T00:00:00.000Z');
		const { db, batches } = database(claim);
		const response = await POST({
			params: { claim_id: claim.claim_id },
			platform: { env: { DB: db } },
			request: confirmationRequest('wrong-token')
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid confirmation request' });
		expect(claim.status).toBe('unconfirmed');
		expect(batches).toHaveLength(0);
	});

	it('rejects an expired request without changing it', async () => {
		const token = 'expired-token';
		const claim = await claimState(token, '2000-01-01T00:00:00.000Z');
		const { db, batches } = database(claim);
		const response = await POST({
			params: { claim_id: claim.claim_id },
			platform: { env: { DB: db } },
			request: confirmationRequest(token)
		} as never);

		expect(response.status).toBe(410);
		expect(await response.json()).toEqual({ error: 'claim_request_expired' });
		expect(claim.status).toBe('unconfirmed');
		expect(batches).toHaveLength(0);
	});

	/**
	 * Confirming from the page is the moment the claimant is handed back their claim. Without the
	 * token in that address they land on a page that cannot read their claim, so the verification
	 * panel they were confirming for never appears.
	 */
	it('sends a page confirmation back to the claim page with the claim and its token', async () => {
		const token = 'page-confirmation-token';
		const claim = await claimState(token, '2999-01-01T00:00:00.000Z');
		const { db } = database(claim);
		const form = new FormData();
		form.set('token', token);
		const response = await POST({
			params: { claim_id: claim.claim_id },
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/claims/claim_example/confirm', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(303);
		const location = new URL(
			response.headers.get('location') ?? '',
			'https://atlas.example.invalid'
		);
		expect(location.pathname).toBe('/claim/atlas-example-1');
		expect(location.searchParams.get('claim')).toBe('claim_example');
		expect(location.searchParams.get('token')).toBe(token);
	});
});
