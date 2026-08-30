// SPDX-License-Identifier: Apache-2.0
/**
 * The mailed link.
 *
 * Two rules decide this page. Opening the link must not spend it, because mail clients and
 * scanners open links on their own and a claimant would arrive at a link already used. And
 * spending it is a single guarded statement, so a link forwarded to a group verifies once.
 */

import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { actions, load } from './+page.server';

const TOKEN = 'mailed-link-token';

interface Options {
	challenge?: Record<string, unknown> | null;
	consumeChanges?: number;
}

async function harness(options: Options = {}) {
	const tokenHash = await hashClaimConfirmationToken(TOKEN);
	const challenge =
		options.challenge === null
			? null
			: {
					challenge_id: 'chal_email',
					claim_id: 'claim_1',
					atlas_id: 'atlas-example-1',
					canonical_name: 'Example Hardware Supplies Ltd',
					country: 'UG',
					target: 'example.co.ug',
					expires_at: '2999-01-01T00:00:00.000Z',
					consumed_at: null,
					...options.challenge
				};
	const statements: { sql: string; bindings: unknown[] }[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				statements.push({ sql, bindings });
				return {
					first: async () =>
						sql.includes('token_hash = ?') && bindings[1] !== tokenHash ? null : challenge,
					run: async () => ({ meta: { changes: options.consumeChanges ?? 1 } })
				};
			}
		}),
		batch: async () => []
	} as unknown as D1Database;
	const cookies = {
		get: () => 'KE',
		set: (name: string, value: string) => sets.push({ name, value })
	};
	const sets: { name: string; value: string }[] = [];
	return { db, statements, sets, cookies, platform: { env: { DB: db } } };
}

describe('mailed verification link', () => {
	it('shows what confirming does without spending the link', async () => {
		const { db, statements, platform, cookies, sets } = await harness();

		const data = await load({
			platform,
			cookies,
			params: { challenge_id: 'chal_email' },
			url: new URL(`https://atlas.example.invalid/claim/verify/chal_email?token=${TOKEN}`)
		} as never);
		void db;

		expect(data).toMatchObject({
			state: 'ready',
			record: { canonical_name: 'Example Hardware Supplies Ltd' },
			domain: 'example.co.ug',
			// The page is about a Ugandan record, so the reader leaves scoped to Uganda.
			recordCountry: 'UG'
		});
		expect(sets).toEqual([{ name: 'country', value: 'UG' }]);
		expect(statements.some((entry) => entry.sql.includes('UPDATE'))).toBe(false);
	});

	it('says nothing to a link with the wrong token', async () => {
		const { statements, platform, cookies } = await harness();

		const data = await load({
			platform,
			cookies,
			params: { challenge_id: 'chal_email' },
			url: new URL('https://atlas.example.invalid/claim/verify/chal_email?token=not-the-token')
		} as never);

		expect(data).toMatchObject({ state: 'invalid', record: null });
		expect(statements.some((entry) => entry.sql.includes('UPDATE'))).toBe(false);
	});

	it('says the link is spent rather than offering it again', async () => {
		const { platform, cookies } = await harness({
			challenge: { consumed_at: '2026-08-30T00:00:00Z' }
		});

		const data = await load({
			platform,
			cookies,
			params: { challenge_id: 'chal_email' },
			url: new URL(`https://atlas.example.invalid/claim/verify/chal_email?token=${TOKEN}`)
		} as never);

		expect(data).toMatchObject({ state: 'used' });
	});

	it('verifies the claim when the link is spent deliberately', async () => {
		const { platform } = await harness();
		const form = new FormData();
		form.set('token', TOKEN);

		const result = await actions.default({
			platform,
			params: { challenge_id: 'chal_email' },
			request: new Request('https://atlas.example.invalid/claim/verify/chal_email', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(result).toMatchObject({ state: 'verified', domain: 'example.co.ug' });
	});

	it('tells a second opener the link was already used', async () => {
		const { platform } = await harness({
			challenge: { consumed_at: '2026-08-30T00:00:00Z' },
			consumeChanges: 0
		});
		const form = new FormData();
		form.set('token', TOKEN);

		const result = await actions.default({
			platform,
			params: { challenge_id: 'chal_email' },
			request: new Request('https://atlas.example.invalid/claim/verify/chal_email', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(result).toMatchObject({ state: 'used' });
	});
});
