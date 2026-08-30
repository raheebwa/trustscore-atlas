import { error, fail } from '@sveltejs/kit';
import { accessConfigFrom, verifyAccessRequest } from '$lib/server/access';
import { getDatabase, requireBucket } from '$lib/server/platform';
import {
	listRegenerations,
	listRequests,
	OpsError,
	requestRegeneration
} from '$lib/server/regeneration-requests';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, parent }) => {
	await parent();
	const db = getDatabase(platform, 'regeneration_requests');
	const [regenerations, requests] = await Promise.all([listRegenerations(db), listRequests(db)]);
	return { regenerations, requests };
};

export const actions: Actions = {
	request: async ({ platform, request }) => {
		const identity = await verifyAccessRequest(
			request,
			accessConfigFrom(platform?.env as Record<string, unknown> | undefined)
		);
		if (!identity) error(403, 'Maintainer access required.');
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		if (kind !== 'regenerate' && kind !== 'rollback') {
			return fail(400, { message: 'Unknown request kind.' });
		}
		try {
			const created = await requestRegeneration(
				getDatabase(platform, 'regeneration_requests'),
				{
					kind,
					target_id: String(form.get('target_id') ?? '') || null,
					reason: String(form.get('reason') ?? ''),
					requested_by: identity.email
				},
				requireBucket(platform)
			);
			return { requested: created.request_id, kind: created.kind, target: created.target_id };
		} catch (cause) {
			if (cause instanceof OpsError) return fail(400, { message: cause.message });
			throw cause;
		}
	}
};
