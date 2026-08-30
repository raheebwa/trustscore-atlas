// SPDX-License-Identifier: Apache-2.0
import { error } from '@sveltejs/kit';
import { hashClaimConfirmationToken } from '$lib/claims';
import { getDatabase } from '$lib/server/platform';
import { publishedMailDomains } from '$lib/server/claim-verification';
import type { PageServerLoad } from './$types';

/** Kept beside the verifier's own limit; the panel counts down from it. */
const MAX_ATTEMPTS = 5;

/** A window is open only when it can be read and has not passed. An unreadable date is closed. */
function isOpen(at: string | null): boolean {
	const closesAt = at ? Date.parse(at) : Number.NaN;
	return Number.isFinite(closesAt) && closesAt > Date.now();
}

interface ClaimConfirmationRow {
	claim_id: string;
	atlas_id: string;
	canonical_name: string;
	claimant_role: string;
	requested_at: string;
	status: string;
	expires_at: string | null;
}

/**
 * What the claimant needs to finish verifying: the string to publish, where to publish it, how
 * long they have and how many attempts remain. It is readable only with the claim's own token,
 * which is the whole of the authorisation, and only on the business the claim is actually for:
 * the page names one business in its header and would otherwise show it above another's claim.
 *
 * A challenge is offered as checkable only while it can still be checked. Anything consumed,
 * expired, unreadable, or past the claim's own window is closed rather than live, so the page
 * never invites a check that the verifier would refuse.
 */
async function loadVerification(
	db: D1Database,
	platform: App.Platform | undefined,
	atlasId: string,
	claimId: string | null,
	token: string | null
) {
	if (!claimId || !token) return null;
	const tokenHash = await hashClaimConfirmationToken(token);
	const claim = await db
		.prepare(
			`SELECT claim_id, atlas_id, expires_at, verified_at, verified_domain, verification_method
			 FROM claims WHERE claim_id = ? AND confirmation_token = ?`
		)
		.bind(claimId, tokenHash)
		.first<{
			claim_id: string;
			atlas_id: string;
			expires_at: string | null;
			verified_at: string | null;
			verified_domain: string | null;
			verification_method: string | null;
		}>();
	if (!claim || claim.atlas_id !== atlasId) return null;

	const challenge = await db
		.prepare(
			`SELECT challenge_id, method, target, challenge_value, expires_at, attempts, outcome,
			        consumed_at
			 FROM claim_challenges WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1`
		)
		.bind(claimId)
		.first<{
			challenge_id: string;
			method: string;
			target: string;
			challenge_value: string | null;
			expires_at: string;
			attempts: number;
			outcome: string | null;
			consumed_at: string | null;
		}>();

	// Documents never advance verification; they are listed so a claimant can see what a maintainer
	// will see, and so the same document is not sent twice.
	const documents = await db
		.prepare(
			`SELECT evidence_id, content_type, byte_size, uploaded_at, uploaded_note
			 FROM claim_evidence WHERE claim_id = ? ORDER BY uploaded_at`
		)
		.bind(claimId)
		.all<{
			evidence_id: string;
			content_type: string;
			byte_size: number;
			uploaded_at: string;
			uploaded_note: string | null;
		}>();

	const base = {
		claim_id: claim.claim_id,
		documents: documents.results ?? [],
		// A mailed link is only ever allowed at a domain a register published for this record, so
		// the page offers it only where there is one, and names it rather than inviting a guess.
		mail_domains: await publishedMailDomains(getDatabase(platform, 'statements'), atlasId),
		token,
		verified_at: claim.verified_at,
		verified_domain: claim.verified_domain,
		verification_method: claim.verification_method
	};
	if (claim.verified_at) return { ...base, state: 'verified' as const, challenge: null };
	if (!challenge) return { ...base, state: 'none' as const, challenge: null };
	if (!isOpen(claim.expires_at) || challenge.consumed_at || !isOpen(challenge.expires_at)) {
		return { ...base, state: 'closed' as const, challenge: null };
	}

	return {
		...base,
		state: 'live' as const,
		challenge: {
			challenge_id: challenge.challenge_id,
			method: challenge.method,
			target: challenge.target,
			challenge_value: challenge.challenge_value,
			expires_at: challenge.expires_at,
			attempts_left: Math.max(0, MAX_ATTEMPTS - challenge.attempts),
			outcome: challenge.outcome
		}
	};
}

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const db = getDatabase(platform, 'businesses');
	const token = url.searchParams.get('token');
	const claimId = url.searchParams.get('claim');

	// Two links reach this page and both carry a token. The confirmation link names the claim in
	// the path; the verification link names the business and carries the claim beside the token,
	// so the claim parameter is what tells them apart.
	if (token && !claimId) {
		const tokenHash = await hashClaimConfirmationToken(token);
		const request = await db
			.prepare(
				`SELECT c.claim_id, c.atlas_id, b.canonical_name, c.claimant_role,
				        c.requested_at, c.status, c.expires_at
				 FROM claims c
				 JOIN businesses b ON b.atlas_id = c.atlas_id
				 WHERE c.claim_id = ? AND c.confirmation_token = ?`
			)
			.bind(params.atlas_id, tokenHash)
			.first<ClaimConfirmationRow>();

		if (!request) {
			return {
				business: null,
				confirmation: { state: 'invalid' as const, record: null, token: null },
				confirmationComplete: false
			};
		}

		const expiresAt = request.expires_at ? Date.parse(request.expires_at) : Number.NaN;
		const state =
			request.status === 'confirmed'
				? ('confirmed' as const)
				: !Number.isFinite(expiresAt) || expiresAt <= Date.now()
					? ('expired' as const)
					: request.status === 'unconfirmed' || request.status === 'requested'
						? ('unconfirmed' as const)
						: ('invalid' as const);

		return {
			business: { atlas_id: request.atlas_id, canonical_name: request.canonical_name },
			confirmation: {
				state,
				record: {
					claim_id: request.claim_id,
					atlas_id: request.atlas_id,
					canonical_name: request.canonical_name,
					claimant_role: request.claimant_role,
					requested_at: request.requested_at
				},
				token
			},
			confirmationComplete: false
		};
	}

	const business = await db
		.prepare('SELECT atlas_id, canonical_name FROM businesses WHERE atlas_id = ?')
		.bind(params.atlas_id)
		.first<{ atlas_id: string; canonical_name: string }>();
	if (!business) error(404, 'Business not found.');

	return {
		business,
		// A form that was refused comes back here rather than ending on a body: the page says why,
		// and carries back what was typed.
		challengeFailed: url.searchParams.get('challenge') === 'failed',
		typed: {
			claimant_role: url.searchParams.get('claimant_role') ?? '',
			website_url: url.searchParams.get('website_url') ?? ''
		},
		confirmation: null,
		confirmationComplete: url.searchParams.get('confirmation') === 'complete',
		verification: await loadVerification(db, platform, params.atlas_id, claimId, token)
	};
};
