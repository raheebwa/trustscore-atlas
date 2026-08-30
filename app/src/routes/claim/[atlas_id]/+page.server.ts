import { error } from '@sveltejs/kit';
import { hashClaimConfirmationToken } from '$lib/claims';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

interface ClaimConfirmationRow {
	claim_id: string;
	atlas_id: string;
	canonical_name: string;
	claimant_role: string;
	requested_at: string;
	status: string;
	expires_at: string | null;
}

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const db = getDatabase(platform, 'businesses');
	const token = url.searchParams.get('token');

	if (token) {
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
		confirmation: null,
		confirmationComplete: url.searchParams.get('confirmation') === 'complete'
	};
};
