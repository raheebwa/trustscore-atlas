import { error } from '@sveltejs/kit';
import { RegenerationInProgressError, getBusinessDetail } from '$lib/server/atlas';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const databases = requireDatabases(platform);
	let detail;
	try {
		detail = await getBusinessDetail(databases, params.atlas_id);
	} catch (cause) {
		if (cause instanceof RegenerationInProgressError) {
			error(503, 'Data is being refreshed, try again in a minute.');
		}
		throw cause;
	}
	if (!detail) {
		error(404, `No business found for atlas_id "${params.atlas_id}".`);
	}
	return detail;
};
