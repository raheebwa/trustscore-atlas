// SPDX-License-Identifier: Apache-2.0
import { json } from '@sveltejs/kit';
import {
	CLAIM_VERIFICATION_STEPS,
	CLAIM_WINDOW_DAYS,
	createClaimConfirmationToken,
	hashClaimConfirmationToken
} from '$lib/claims';
import {
	prepareWebsiteChallenge,
	websiteChallengeTarget,
	type IssuedChallenge
} from '$lib/server/claim-verification';
import { apiBadRequest, apiNotFound, apiServerError, claimPageRedirect } from '$lib/server/api';
import { envValue, getDatabase } from '$lib/server/platform';
import { verifyTurnstile } from '$lib/server/turnstile';
import type { ClaimResponse } from '$lib/types';
import type { RequestHandler } from './$types';

interface ClaimInput {
	atlas_id?: unknown;
	claimant_role?: unknown;
	/** Optional: ask for a challenge with the claim itself. */
	verification_method?: unknown;
	website_url?: unknown;
	email?: unknown;
	/** The solved challenge a page form carries. Never present on an API call. */
	turnstile_token?: unknown;
}

interface ParsedClaimInput {
	input: ClaimInput;
	isPageForm: boolean;
}

async function readInput(request: Request): Promise<ParsedClaimInput> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value: unknown = await request.json();
		return {
			input: typeof value === 'object' && value !== null ? (value as ClaimInput) : {},
			isPageForm: false
		};
	}
	const form = await request.formData();
	return {
		input: {
			atlas_id: form.get('atlas_id'),
			claimant_role: form.get('claimant_role'),
			verification_method: form.get('verification_method'),
			website_url: form.get('website_url'),
			email: form.get('email'),
			turnstile_token: form.get('cf-turnstile-response')
		},
		isPageForm: true
	};
}

function validText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export const POST: RequestHandler = async ({ fetch, platform, request }) => {
	try {
		const { input, isPageForm } = await readInput(request);
		// A form a stranger can submit carries the challenge, when this deployment sets one.
		if (isPageForm) {
			const passed = await verifyTurnstile({
				secret: envValue(platform, 'TURNSTILE_SECRET_KEY'),
				token: typeof input.turnstile_token === 'string' ? input.turnstile_token : null,
				remoteIp: request.headers.get('cf-connecting-ip'),
				fetchImpl: fetch
			});
			if (!passed.ok) {
				return apiBadRequest('the check on this form did not pass; reload the page and try again');
			}
		}
		if (!validText(input.atlas_id, 200) || !validText(input.claimant_role, 100)) {
			return apiBadRequest('invalid claim request');
		}
		const atlasId = input.atlas_id.trim();
		const claimantRole = input.claimant_role.trim();
		const db = getDatabase(platform, 'claims');
		const business = await db
			.prepare('SELECT canonical_name FROM businesses WHERE atlas_id = ?')
			.bind(atlasId)
			.first<{ canonical_name: string }>();
		if (!business) return apiNotFound('business_not_found');

		// A website challenge is decided before anything is written. A claim row is durable and its
		// event cannot be deleted, so an address that can never be checked is refused here rather
		// than leaving a claim nobody holds the link to.
		// Only the website challenge is issued with the claim. A mailed link lasts thirty minutes and
		// is only allowed once a claim is confirmed, so issuing one here would hand out a link that
		// expired before it could be used: mail is asked for from the verify endpoint instead.
		const wantsChallenge =
			validText(input.website_url, 300) ||
			validText(input.email, 320) ||
			validText(input.verification_method, 40);
		if (wantsChallenge && input.verification_method !== 'website_string') {
			return apiBadRequest(
				'claims are created with verification_method website_string; ask for a mailed link from /api/v1/claims/{claim_id}/verify/email once the claim is confirmed'
			);
		}

		let challengeTarget: string | null = null;
		if (wantsChallenge) {
			if (!validText(input.website_url, 300)) {
				return apiBadRequest('a website challenge needs a website address');
			}
			try {
				challengeTarget = websiteChallengeTarget(input.website_url);
			} catch {
				return apiBadRequest('a website challenge needs a public https address');
			}
		}

		const claimId = newId('claim');
		const eventId = newId('claim_event');
		const requestedAt = new Date().toISOString();
		const status = isPageForm ? 'confirmed' : 'unconfirmed';
		// A page claimant is confirmed on the spot and leaves holding the only link back, so their
		// window is the verification window. An API claimant still has 24 hours to confirm.
		const windowMs = isPageForm ? CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
		const expiresAt = new Date(Date.parse(requestedAt) + windowMs).toISOString();
		const confirmedAt = isPageForm ? requestedAt : null;
		const plainToken = createClaimConfirmationToken();
		const tokenHash = await hashClaimConfirmationToken(plainToken);

		// The challenge is written with the claim, never after it: a claim whose challenge failed to
		// land would be a link to a page that can never be completed, and neither row can be removed.
		const challenge = challengeTarget
			? prepareWebsiteChallenge(db, claimId, challengeTarget)
			: null;

		await db.batch([
			db
				.prepare(
					`INSERT INTO claims
					 (claim_id, atlas_id, claimant_role, requested_at, status, verification_method,
					  expires_at, confirmed_at, confirmation_token)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					claimId,
					atlasId,
					claimantRole,
					requestedAt,
					status,
					challengeTarget ? 'website_string' : null,
					expiresAt,
					confirmedAt,
					tokenHash
				),
			db
				.prepare(
					`INSERT INTO claim_events
					 (event_id, claim_id, event_type, occurred_at, payload)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(
					eventId,
					claimId,
					status,
					requestedAt,
					JSON.stringify({
						atlas_id: atlasId,
						canonical_name: business.canonical_name,
						claimant_role: claimantRole,
						status,
						expires_at: expiresAt
					})
				),
			...(challenge ? [challenge.statement] : [])
		]);

		const verification: IssuedChallenge | null = challenge?.issued ?? null;

		if (isPageForm) return claimPageRedirect(atlasId, claimId, plainToken);

		const response: ClaimResponse & { verification?: IssuedChallenge } = {
			claim_id: claimId,
			status: 'unconfirmed',
			confirm_url: `/claim/${encodeURIComponent(claimId)}?token=${encodeURIComponent(plainToken)}`,
			expires_at: expiresAt,
			verification_steps: [...CLAIM_VERIFICATION_STEPS],
			...(verification ? { verification } : {})
		};
		return json(response, { status: 201 });
	} catch (err) {
		return apiServerError(err);
	}
};
