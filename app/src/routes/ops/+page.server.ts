import { error, fail } from '@sveltejs/kit';
import { accessConfigFrom, verifyAccessRequest } from '$lib/server/access';
import { decideRequest, listQueue, OpsError, REQUEST_TYPES } from '$lib/server/ops';
import type { ModerationRequestType } from '$lib/server/ops';
import { getDatabase } from '$lib/server/platform';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDatabase(platform, 'moderation_decisions');
	return { queue: await listQueue(db) };
};

export const actions: Actions = {
	decide: async ({ platform, request }) => {
		const identity = await verifyAccessRequest(
			request,
			accessConfigFrom(platform?.env as Record<string, unknown> | undefined)
		);
		if (!identity) error(403, 'Maintainer access required.');
		const form = await request.formData();
		const requestType = String(form.get('request_type') ?? '');
		const decision = String(form.get('decision') ?? '');
		if (!REQUEST_TYPES.includes(requestType as ModerationRequestType)) {
			return fail(400, { message: 'Unknown request type.' });
		}
		if (decision !== 'approved' && decision !== 'rejected') {
			return fail(400, { message: 'Decision must be approved or rejected.' });
		}
		try {
			const record = await decideRequest(getDatabase(platform, 'moderation_decisions'), {
				request_type: requestType as ModerationRequestType,
				request_id: String(form.get('request_id') ?? ''),
				decision,
				reason: String(form.get('reason') ?? ''),
				decided_by: identity.email
			});
			return { decided: record.request_id, decision: record.decision };
		} catch (cause) {
			if (cause instanceof OpsError) return fail(400, { message: cause.message });
			throw cause;
		}
	}
};
