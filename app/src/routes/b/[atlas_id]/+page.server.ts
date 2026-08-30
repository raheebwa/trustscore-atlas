import { deploymentVersion } from '$lib/server/cache-scope';
import { error } from '@sveltejs/kit';
import { RegenerationInProgressError } from '$lib/server/atlas';
import { cachedBusinessDetail } from '$lib/server/business-cache';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const databases = requireDatabases(platform);
	let detail;
	try {
		detail = await cachedBusinessDetail(
			databases,
			platform?.env?.CACHE,
			params.atlas_id,
			undefined,
			deploymentVersion(platform?.env as Record<string, unknown> | undefined)
		);
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
