// SPDX-License-Identifier: Apache-2.0
/**
 * Ask Atlas to mail a verification link.
 *
 * Everything about the address is answered the same way: accepted. Whether the domain was one the
 * claim had earned, whether the address was even an address, whether the provider took it, all
 * produce the same body, because a different answer would let anyone holding a claim link ask
 * questions about other people's records and about which mailboxes exist.
 *
 * What is answered plainly is the state of the claim itself, which the token already proves
 * belongs to the caller: a claim nobody confirmed, a window that has closed, a claim already
 * verified.
 *
 * No page posts here. The claim page offers the website method, because a mailed link is only
 * ever allowed for a domain a register already published for the record, and no pack publishes
 * one yet. This is the door for the API and for an agent holding a claim's own link.
 */

import { hashClaimConfirmationToken } from '$lib/claims';
import { apiBadRequest, apiNotFound, apiOptions, apiServerError } from '$lib/server/api';
import { claimVerificationMail } from '$lib/server/claim-mail';
import { emailDomainAllowed, prepareEmailChallenge } from '$lib/server/claim-verification';
import { resendMailer } from '$lib/server/mail';
import { envValue, requireDatabases } from '$lib/server/platform';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Links a claim may be sent in a day. A mailbox is not a place to leave standing keys. */
const MAX_SENDS = 3;
const DAY_SECONDS = 24 * 60 * 60;

interface EmailInput {
	token?: unknown;
	email?: unknown;
}

async function readInput(request: Request): Promise<EmailInput> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value: unknown = await request.json();
		return typeof value === 'object' && value !== null ? (value as EmailInput) : {};
	}
	const form = await request.formData();
	return { token: form.get('token'), email: form.get('email') };
}

function valid(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * The origin a mailed link points at. It is pinned rather than taken from the caller's own Host,
 * because the caller of this endpoint is a stranger and the link goes to somebody else's mailbox.
 */
function canonicalOrigin(platform: App.Platform | undefined, request: Request): string {
	const configured = envValue(platform, 'PUBLIC_ORIGIN');
	if (configured) return new URL(configured).origin;
	return new URL(request.url).origin;
}

const accepted = () =>
	json({ status: 'accepted' }, { headers: { 'Access-Control-Allow-Origin': '*' } });

export const POST: RequestHandler = async ({ fetch, params, platform, request }) => {
	try {
		const input = await readInput(request);
		if (!valid(input.token, 512) || !valid(input.email, 320)) {
			return apiBadRequest('invalid verification request');
		}
		const databases = requireDatabases(platform);

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
		if (claim.status !== 'confirmed') {
			return json({ error: 'claim_not_confirmed' }, { status: 409 });
		}
		const closesAt = claim.expires_at ? Date.parse(claim.expires_at) : Number.NaN;
		if (!Number.isFinite(closesAt) || closesAt <= Date.now()) {
			return json({ error: 'claim_window_closed' }, { status: 410 });
		}
		if (claim.verified_at) {
			return json({ status: 'verified' }, { headers: { 'Access-Control-Allow-Origin': '*' } });
		}

		// From here every exit is the same word, whatever the reason.
		// The count covers every ask that got this far, not only the ones that ended in mail, so
		// the endpoint cannot be worked repeatedly by asking about addresses. A count that cannot
		// be read is treated as spent rather than as zero.
		const cache = platform?.env?.CACHE;
		const key = `claim-mail:${claim.claim_id}`;
		const asked = Number((await cache?.get(key)) ?? 0);
		if (!Number.isFinite(asked) || asked >= MAX_SENDS) return accepted();
		await cache?.put(key, String(asked + 1), { expirationTtl: DAY_SECONDS });

		const mailer = resendMailer({
			apiKey: envValue(platform, 'RESEND_API_KEY'),
			from: envValue(platform, 'MAIL_FROM'),
			fetchImpl: fetch
		});
		if (!mailer) return accepted();

		const email = input.email.trim();
		const domain = email.split('@')[1]?.toLowerCase() ?? '';
		if (!domain || !(await emailDomainAllowed(databases.statementsDb, claim.atlas_id, domain))) {
			return accepted();
		}

		let challenge;
		try {
			challenge = await prepareEmailChallenge(databases.db, claim.claim_id, email);
		} catch {
			return accepted();
		}
		await databases.db.batch([challenge.statement]);

		await mailer.send(
			claimVerificationMail(
				email,
				canonicalOrigin(platform, request),
				challenge.issued.challenge_id,
				challenge.issued.link_token
			)
		);

		return accepted();
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
