import { error } from '@sveltejs/kit';
import { getBusinessDetail } from '$lib/server/atlas';
import { requireDb } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const db = requireDb(platform);
	const detail = await getBusinessDetail(db, params.atlas_id);
	if (!detail) {
		error(404, `No business found for atlas_id "${params.atlas_id}".`);
	}
	return detail;
};
