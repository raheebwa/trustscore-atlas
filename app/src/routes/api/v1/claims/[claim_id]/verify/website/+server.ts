// SPDX-License-Identifier: Apache-2.0
/**
 * Ask Atlas to look for the challenge string on the claimed website.
 *
 * The claimant holds a link, not an account, so the claim's confirmation token is what authorises
 * this: without it, anyone could burn someone else's attempts. The answer says only whether the
 * string was found and, when it was not, which of the verifier's own reasons applied. It never
 * carries anything the checked site returned.
 */

import { hashClaimConfirmationToken } from '$lib/claims';
import {
	apiBadRequest,
	apiNotFound,
	apiOptions,
	apiServerError,
	claimPageRedirect
} from '$lib/server/api';
import { runWebsiteAttempt } from '$lib/server/claim-verification';
import { requireDatabases } from '$lib/server/platform';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface VerifyInput {
	token?: unknown;
	challenge_id?: unknown;
}

async function readInput(request: Request): Promise<{ input: VerifyInput; isPageForm: boolean }> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value: unknown = await request.json();
		return {
			input: typeof value === 'object' && value !== null ? (value as VerifyInput) : {},
			isPageForm: false
		};
	}
	const form = await request.formData();
	return {
		input: { token: form.get('token'), challenge_id: form.get('challenge_id') },
		isPageForm: true
	};
}

function valid(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export const POST: RequestHandler = async ({ params, platform, request }) => {
	try {
		const { input, isPageForm } = await readInput(request);
		if (!valid(input.token, 512) || !valid(input.challenge_id, 200)) {
			return apiBadRequest('invalid verification request');
		}
		const databases = requireDatabases(platform);

		// The token proves this is the claimant's own claim, and the challenge has to belong to it:
		// a challenge id from another claim must not be runnable with this token.
		const claim = await databases.db
			.prepare(
				`SELECT claim_id, atlas_id, status, expires_at, confirmation_token, verified_at
				 FROM claims WHERE claim_id = ?`
			)
			.bind(params.claim_id)
			.first<{
				claim_id: string;
				atlas_id: string;
				status: string;
				expires_at: string | null;
				confirmation_token: string | null;
				verified_at: string | null;
			}>();
		if (!claim) return apiNotFound('claim_not_found');

		const presented = await hashClaimConfirmationToken(input.token.trim());
		if (!claim.confirmation_token || claim.confirmation_token !== presented) {
			return apiNotFound('claim_not_found');
		}
		const token = input.token.trim();

		// A claim nobody confirmed, or one whose window has closed, is not verifiable: the token
		// bounds who is asking, the claim bounds whether there is still anything to ask about. The
		// window check fails closed, so an unreadable date closes it.
		if (claim.status !== 'confirmed') {
			return json({ error: 'claim_not_confirmed' }, { status: 409 });
		}
		const closesAt = claim.expires_at ? Date.parse(claim.expires_at) : Number.NaN;
		if (!Number.isFinite(closesAt) || closesAt <= Date.now()) {
			return json({ error: 'claim_window_closed' }, { status: 410 });
		}

		if (claim.verified_at) {
			if (isPageForm) return claimPageRedirect(claim.atlas_id, claim.claim_id, token);
			return json(
				{ status: 'verified', outcome: 'already_verified' },
				{ headers: { 'Access-Control-Allow-Origin': '*' } }
			);
		}

		const owned = await databases.db
			.prepare('SELECT challenge_id FROM claim_challenges WHERE challenge_id = ? AND claim_id = ?')
			.bind(input.challenge_id.trim(), params.claim_id)
			.first<{ challenge_id: string }>();
		if (!owned) return apiNotFound('challenge_not_found');

		const result = await runWebsiteAttempt(databases.db, input.challenge_id.trim());
		if (isPageForm) return claimPageRedirect(claim.atlas_id, claim.claim_id, token);
		return json(
			{
				status: result.verified ? 'verified' : 'not_verified',
				outcome: result.outcome,
				...(result.probe ? { found_in: result.probe } : {})
			},
			{ headers: { 'Access-Control-Allow-Origin': '*' } }
		);
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
