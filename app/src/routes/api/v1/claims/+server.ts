import { json } from '@sveltejs/kit';
import { CLAIM_VERIFICATION_STEPS } from '$lib/claims';
import { apiBadRequest, apiNotFound, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import type { ClaimResponse } from '$lib/types';
import type { RequestHandler } from './$types';

interface ClaimInput {
	atlas_id?: unknown;
	claimant_role?: unknown;
}

async function readInput(request: Request): Promise<ClaimInput> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value: unknown = await request.json();
		return typeof value === 'object' && value !== null ? (value as ClaimInput) : {};
	}
	const form = await request.formData();
	return {
		atlas_id: form.get('atlas_id'),
		claimant_role: form.get('claimant_role')
	};
}

function validText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export const POST: RequestHandler = async ({ platform, request }) => {
	try {
		const input = await readInput(request);
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
		await db.batch([
			db
				.prepare(
					`INSERT INTO claims
					 (claim_id, atlas_id, claimant_role, requested_at, status, verification_method)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.bind(claimId, atlasId, claimantRole, requestedAt, 'requested', null),
			db
				.prepare(
					`INSERT INTO claim_events
					 (event_id, claim_id, event_type, occurred_at, payload)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.bind(
					eventId,
					claimId,
					'requested',
					requestedAt,
					JSON.stringify({
						atlas_id: atlasId,
						canonical_name: business.canonical_name,
						claimant_role: claimantRole,
						status: 'requested'
					})
				)
		]);

		const response: ClaimResponse = {
			claim_id: claimId,
			status: 'requested',
			verification_steps: [...CLAIM_VERIFICATION_STEPS]
		};
		return json(response, { status: 201 });
	} catch (err) {
		return apiServerError(err);
	}
};
