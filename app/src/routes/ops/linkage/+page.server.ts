import { error, fail } from '@sveltejs/kit';
import { accessConfigFrom, verifyAccessRequest } from '$lib/server/access';
import { listReviewCandidates, OpsError, recordMaintainerLabel } from '$lib/server/linkage-review';
import { getDatabase } from '$lib/server/platform';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, parent }) => {
	await parent();
	const db = getDatabase(platform, 'linkage_candidates');
	return { candidates: await listReviewCandidates(db) };
};

export const actions: Actions = {
	label: async ({ platform, request }) => {
		const identity = await verifyAccessRequest(
			request,
			accessConfigFrom(platform?.env as Record<string, unknown> | undefined)
		);
		if (!identity) error(403, 'Maintainer access required.');
		const form = await request.formData();
		const verdict = String(form.get('verdict') ?? '');
		if (verdict !== 'match' && verdict !== 'non_match') {
			return fail(400, { message: 'Verdict must be match or non_match.' });
		}
		try {
			const label = await recordMaintainerLabel(getDatabase(platform, 'maintainer_labels'), {
				atlas_id: String(form.get('atlas_id') ?? ''),
				candidate_atlas_id: String(form.get('candidate_atlas_id') ?? ''),
				verdict,
				reason: String(form.get('reason') ?? ''),
				labelled_by: identity.email
			});
			return {
				labelled: `${label.atlas_id} and ${label.candidate_atlas_id}`,
				verdict: label.verdict
			};
		} catch (cause) {
			if (cause instanceof OpsError) return fail(400, { message: cause.message });
			throw cause;
		}
	}
};
