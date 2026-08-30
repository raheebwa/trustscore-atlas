// SPDX-License-Identifier: Apache-2.0
/**
 * The page a mailed verification link opens.
 *
 * Opening the link says what confirming would do and spends nothing: mail clients, scanners and
 * link previews all fetch a link before a person ever sees it, so a link spent by a GET would be
 * used up before it arrived. Confirming is a deliberate press, and the press is what spends it.
 */

import { hashClaimConfirmationToken } from '$lib/claims';
import { consumeEmailChallenge } from '$lib/server/claim-verification';
import { getDatabase } from '$lib/server/platform';
import type { Actions, PageServerLoad } from './$types';

interface LinkRow {
	challenge_id: string;
	claim_id: string;
	atlas_id: string;
	canonical_name: string;
	country: string;
	target: string;
	expires_at: string;
	consumed_at: string | null;
}

/** The link, or nothing at all: a wrong token is answered exactly like a link that never was. */
async function readLink(
	db: D1Database,
	challengeId: string,
	token: string | null
): Promise<LinkRow | null> {
	if (!token) return null;
	return db
		.prepare(
			`SELECT ch.challenge_id, ch.claim_id, c.atlas_id, b.canonical_name, b.country, ch.target,
			        ch.expires_at, ch.consumed_at
			 FROM claim_challenges ch
			 JOIN claims c ON c.claim_id = ch.claim_id
			 JOIN businesses b ON b.atlas_id = c.atlas_id
			 WHERE ch.challenge_id = ? AND ch.token_hash = ? AND ch.method = 'domain_email'`
		)
		.bind(challengeId, await hashClaimConfirmationToken(token.trim()))
		.first<LinkRow>();
}

export const load: PageServerLoad = async ({ cookies, params, platform, url }) => {
	const db = getDatabase(platform, 'claims');
	const link = await readLink(db, params.challenge_id, url.searchParams.get('token'));
	if (!link) {
		return {
			state: 'invalid' as const,
			record: null,
			domain: null,
			token: null,
			recordCountry: null
		};
	}

	// This page is about one record, so the shell is scoped to that record's country rather than to
	// whatever the reader was last looking at, and they leave scoped to it.
	const recordCountry = link.country?.trim().toUpperCase() || null;
	if (recordCountry && cookies.get('country') !== recordCountry) {
		cookies.set('country', recordCountry, {
			path: '/',
			maxAge: 31536000,
			sameSite: 'lax',
			httpOnly: false
		});
	}

	const expiresAt = Date.parse(link.expires_at);
	const state = link.consumed_at
		? ('used' as const)
		: !Number.isFinite(expiresAt) || expiresAt <= Date.now()
			? ('expired' as const)
			: ('ready' as const);

	return {
		state,
		record: { atlas_id: link.atlas_id, canonical_name: link.canonical_name },
		domain: link.target,
		token: url.searchParams.get('token'),
		recordCountry
	};
};

export const actions: Actions = {
	default: async ({ params, platform, request }) => {
		const db = getDatabase(platform, 'claims');
		const form = await request.formData();
		const token = form.get('token');
		if (typeof token !== 'string' || !token.trim()) {
			return { state: 'invalid' as const, domain: null };
		}

		const link = await readLink(db, params.challenge_id, token);
		if (!link) return { state: 'invalid' as const, domain: null };

		const result = await consumeEmailChallenge(db, params.challenge_id, token);
		if (result.verified) return { state: 'verified' as const, domain: link.target };
		if (result.outcome === 'already_used' || result.outcome === 'already_verified') {
			return { state: 'used' as const, domain: link.target };
		}
		if (result.outcome === 'expired') return { state: 'expired' as const, domain: link.target };
		return { state: 'invalid' as const, domain: null };
	}
};
