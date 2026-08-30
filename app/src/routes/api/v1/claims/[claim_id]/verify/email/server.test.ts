// SPDX-License-Identifier: Apache-2.0
/**
 * Asking for a verification link.
 *
 * The answer is the same whatever happens to the address: accepted. A different answer for a
 * domain that is allowed, an address that exists, or a mailbox the provider refused would turn
 * this endpoint into a way to ask questions about other people's records. What varies is only what
 * the claimant is told about their own claim, which the token already proves is theirs.
 */

import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

const TOKEN = 'a-real-looking-token';

interface Options {
	status?: string;
	expiresAt?: string | null;
	verifiedAt?: string | null;
	published?: string[];
	sends?: string | null;
	origin?: string;
	mailer?: { sent: boolean };
}

function harness(options: Options = {}) {
	const statements: { sql: string; bindings: unknown[] }[] = [];
	const batches: { sql: string; bindings: unknown[] }[][] = [];
	const mails: { to: string; subject: string; text: string }[] = [];
	const puts: { key: string; value: string }[] = [];

	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const statement = { sql, bindings };
				statements.push(statement);
				return {
					...statement,
					first: async () => {
						if (sql.includes('FROM claims')) {
							return {
								claim_id: 'claim_1',
								atlas_id: 'atlas-example-1',
								status: options.status ?? 'confirmed',
								expires_at:
									options.expiresAt === undefined ? '2999-01-01T00:00:00.000Z' : options.expiresAt,
								confirmation_token: hashed,
								verified_at: options.verifiedAt ?? null
							};
						}
						return null;
					},
					all: async () => ({
						// The published websites of the record named in the query, and only that record.
						results:
							sql.includes('FROM statements') && bindings[0] === 'atlas-example-1'
								? (options.published ?? []).map((value) => ({ value }))
								: []
					}),
					run: async () => ({ meta: { changes: 1 } })
				};
			}
		}),
		batch: async (batched: { sql: string; bindings: unknown[] }[]) => {
			batches.push(batched);
			return [];
		}
	} as unknown as D1Database;

	let hashed = '';
	const cache = {
		get: async () => options.sends ?? null,
		put: async (key: string, value: string) => {
			puts.push({ key, value });
		}
	} as unknown as KVNamespace;

	const platform = {
		env: {
			DB: db,
			DB_STATEMENTS: db,
			DB_SCORES: db,
			CACHE: cache,
			RESEND_API_KEY: 'key-example',
			MAIL_FROM: 'claims@atlas.example.invalid',
			...(options.origin ? { PUBLIC_ORIGIN: options.origin } : {})
		}
	};

	const fetchImpl = (async (url: string, init: RequestInit) => {
		const body = JSON.parse(String(init.body)) as { to: string[]; subject: string; text: string };
		mails.push({ to: body.to[0], subject: body.subject, text: body.text });
		void url;
		return new Response('{}', { status: options.mailer?.sent === false ? 403 : 200 });
	}) as unknown as typeof fetch;

	return {
		platform,
		batches,
		statements,
		mails,
		puts,
		fetchImpl,
		async ready() {
			hashed = await hashClaimConfirmationToken(TOKEN);
		}
	};
}

async function call(body: unknown, options: Options = {}) {
	const context = harness(options);
	await context.ready();
	const response = await POST({
		params: { claim_id: 'claim_1' },
		platform: context.platform,
		request: new Request('https://atlas.example.invalid/api/v1/claims/claim_1/verify/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		fetch: context.fetchImpl
	} as never);
	return { response, ...context };
}

describe('email verification request', () => {
	it('mails a link for a domain a register published as the record website', async () => {
		const { response, mails, batches } = await call(
			{ token: TOKEN, email: 'owner@example.co.ug' },
			{ published: ['https://example.co.ug'] }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'accepted' });
		expect(mails).toHaveLength(1);
		expect(mails[0].to).toBe('owner@example.co.ug');
		expect(mails[0].text).toMatch(/\/claim\/verify\/chal_[0-9a-f]+\?token=[a-z0-9]+/);
		expect(batches).toHaveLength(1);
	});

	it('answers the same for a domain this claim has not earned, and mails nothing', async () => {
		const { response, mails, batches } = await call(
			{ token: TOKEN, email: 'owner@somewhere-else.example' },
			{ published: ['https://example.co.ug'] }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'accepted' });
		expect(mails).toHaveLength(0);
		expect(batches).toHaveLength(0);
	});

	it('answers the same for an address that is not one, and mails nothing', async () => {
		const { response, mails } = await call({ token: TOKEN, email: 'not-an-address' });

		expect(await response.json()).toEqual({ status: 'accepted' });
		expect(mails).toHaveLength(0);
	});

	it('stops after three links in a day, still saying accepted', async () => {
		const { response, mails } = await call(
			{ token: TOKEN, email: 'owner@example.co.ug' },
			{ published: ['https://example.co.ug'], sends: '3' }
		);

		expect(await response.json()).toEqual({ status: 'accepted' });
		expect(mails).toHaveLength(0);
	});

	it('counts a link that was sent', async () => {
		const { puts } = await call(
			{ token: TOKEN, email: 'owner@example.co.ug' },
			{ published: ['https://example.co.ug'] }
		);

		expect(puts).toEqual([{ key: 'claim-mail:claim_1', value: '1' }]);
	});

	it('says only "not found" to a wrong token', async () => {
		const { response, mails } = await call({ token: 'not-the-token', email: 'o@example.co.ug' });

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'claim_not_found' });
		expect(mails).toHaveLength(0);
	});

	it('refuses a claim that was never confirmed, and one whose window has closed', async () => {
		expect(
			(await call({ token: TOKEN, email: 'o@example.co.ug' }, { status: 'unconfirmed' })).response
				.status
		).toBe(409);
		expect(
			(
				await call(
					{ token: TOKEN, email: 'o@example.co.ug' },
					{ expiresAt: '2000-01-01T00:00:00Z' }
				)
			).response.status
		).toBe(410);
	});

	it('does not mail a claim that is already verified', async () => {
		const { response, mails } = await call(
			{ token: TOKEN, email: 'owner@example.co.ug' },
			{ published: ['https://example.co.ug'], verifiedAt: '2026-08-30T00:00:00Z' }
		);

		expect(await response.json()).toEqual({ status: 'verified' });
		expect(mails).toHaveLength(0);
	});

	// A claimant asking from the claim page is answered on that page, and the answer is the same
	// whether or not the address was one the record publishes.
	it.each([
		['a domain the record publishes', 'owner@example.co.ug'],
		['a domain it does not', 'owner@somewhere-else.example']
	])('sends a page claimant back to their own claim for %s', async (_label, email) => {
		const { response } = await call(
			{ token: TOKEN, email, from: 'page' },
			{ published: ['https://example.co.ug'] }
		);

		expect(response.status).toBe(303);
		const location = new URL(
			response.headers.get('location') ?? '',
			'https://atlas.example.invalid'
		);
		expect(location.pathname).toBe('/claim/atlas-example-1');
		expect(location.searchParams.get('claim')).toBe('claim_1');
		expect(location.searchParams.get('token')).toBe(TOKEN);
	});
});
