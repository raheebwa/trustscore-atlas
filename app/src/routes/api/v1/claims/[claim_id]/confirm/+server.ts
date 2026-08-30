import { json } from '@sveltejs/kit';
import { CLAIM_VERIFICATION_STEPS, hashClaimConfirmationToken } from '$lib/claims';
import { apiBadRequest, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import type { ConfirmedClaimResponse } from '$lib/types';
import type { RequestHandler } from './$types';

interface ConfirmationInput {
	token?: unknown;
}

interface ClaimRow {
	claim_id: string;
	atlas_id: string;
	status: string;
	expires_at: string | null;
}

async function readToken(request: Request): Promise<{ token: unknown; isPageForm: boolean }> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value: unknown = await request.json();
		return {
			token:
				typeof value === 'object' && value !== null
					? (value as ConfirmationInput).token
					: undefined,
			isPageForm: false
		};
	}
	const form = await request.formData();
	return { token: form.get('token'), isPageForm: true };
}

function validToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 512;
}

function confirmedResponse(claimId: string): ConfirmedClaimResponse {
	return {
		claim_id: claimId,
		status: 'confirmed',
		verification_steps: [...CLAIM_VERIFICATION_STEPS]
	};
}

function claimPageRedirect(atlasId: string): Response {
	return new Response(null, {
		status: 303,
		headers: { Location: `/claim/${encodeURIComponent(atlasId)}?confirmation=complete` }
	});
}

export const POST: RequestHandler = async ({ params, platform, request }) => {
	try {
		const { token, isPageForm } = await readToken(request);
		if (!validToken(token)) return apiBadRequest('invalid confirmation request');

		const tokenHash = await hashClaimConfirmationToken(token);
		const db = getDatabase(platform, 'claims');
		const claim = await db
			.prepare(
				`SELECT claim_id, atlas_id, status, expires_at
				 FROM claims
				 WHERE claim_id = ? AND confirmation_token = ?`
			)
			.bind(params.claim_id, tokenHash)
			.first<ClaimRow>();
		if (!claim) return apiBadRequest('invalid confirmation request');

		if (claim.status === 'confirmed') {
			return isPageForm
				? claimPageRedirect(claim.atlas_id)
				: json(confirmedResponse(claim.claim_id));
		}

		const expiresAt = claim.expires_at ? Date.parse(claim.expires_at) : Number.NaN;
		if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
			return json({ error: 'claim_request_expired' }, { status: 410 });
		}
		if (claim.status !== 'unconfirmed' && claim.status !== 'requested') {
			return apiBadRequest('invalid confirmation request');
		}

		const confirmedAt = new Date().toISOString();
		const eventId = `claim_event_${crypto.randomUUID().replaceAll('-', '')}`;
		await db.batch([
			db
				.prepare(
					`UPDATE claims
					 SET status = ?, confirmed_at = ?
					 WHERE claim_id = ? AND confirmation_token = ?
					   AND status IN (?, ?) AND expires_at > ?`
				)
				.bind(
					'confirmed',
					confirmedAt,
					claim.claim_id,
					tokenHash,
					'unconfirmed',
					'requested',
					confirmedAt
				),
			db
				.prepare(
					`INSERT INTO claim_events (event_id, claim_id, event_type, occurred_at, payload)
					 SELECT ?, claim_id, ?, ?, ?
					 FROM claims
					 WHERE claim_id = ? AND confirmation_token = ? AND status = ? AND confirmed_at = ?`
				)
				.bind(
					eventId,
					'confirmed',
					confirmedAt,
					JSON.stringify({ previous_status: claim.status, status: 'confirmed' }),
					claim.claim_id,
					tokenHash,
					'confirmed',
					confirmedAt
				)
		]);

		return isPageForm ? claimPageRedirect(claim.atlas_id) : json(confirmedResponse(claim.claim_id));
	} catch (err) {
		return apiServerError(err);
	}
};
