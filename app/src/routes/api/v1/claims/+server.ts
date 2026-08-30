import { json } from '@sveltejs/kit';
import {
	CLAIM_VERIFICATION_STEPS,
	createClaimConfirmationToken,
	hashClaimConfirmationToken
} from '$lib/claims';
import { apiBadRequest, apiNotFound, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import type { ClaimResponse } from '$lib/types';
import type { RequestHandler } from './$types';

interface ClaimInput {
	atlas_id?: unknown;
	claimant_role?: unknown;
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
			claimant_role: form.get('claimant_role')
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

function claimPageRedirect(atlasId: string): Response {
	return new Response(null, {
		status: 303,
		headers: { Location: `/claim/${encodeURIComponent(atlasId)}?confirmation=complete` }
	});
}

export const POST: RequestHandler = async ({ platform, request }) => {
	try {
		const { input, isPageForm } = await readInput(request);
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

		const claimId = newId('claim');
		const eventId = newId('claim_event');
		const requestedAt = new Date().toISOString();
		const status = isPageForm ? 'confirmed' : 'unconfirmed';
		const expiresAt = isPageForm
			? null
			: new Date(Date.parse(requestedAt) + 24 * 60 * 60 * 1000).toISOString();
		const confirmedAt = isPageForm ? requestedAt : null;
		const plainToken = isPageForm ? null : createClaimConfirmationToken();
		const tokenHash = plainToken ? await hashClaimConfirmationToken(plainToken) : null;

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
					null,
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
						...(expiresAt ? { expires_at: expiresAt } : {})
					})
				)
		]);

		if (isPageForm) return claimPageRedirect(atlasId);

		const response: ClaimResponse = {
			claim_id: claimId,
			status: 'unconfirmed',
			confirm_url: `/claim/${encodeURIComponent(claimId)}?token=${encodeURIComponent(plainToken!)}`,
			expires_at: expiresAt!,
			verification_steps: [...CLAIM_VERIFICATION_STEPS]
		};
		return json(response, { status: 201 });
	} catch (err) {
		return apiServerError(err);
	}
};
