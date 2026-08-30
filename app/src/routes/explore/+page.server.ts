import { deploymentVersion } from '$lib/server/cache-scope';
import { error } from '@sveltejs/kit';
import { RegenerationInProgressError } from '$lib/server/atlas';
import { exploreSegmentsCached } from '$lib/server/explore';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const databases = requireDatabases(platform);
	const country = url.searchParams.get('country')?.trim() ?? '';
	if (country && !/^[A-Za-z]{2}$/.test(country)) error(400, 'Invalid country code.');
	try {
		const explore = await exploreSegmentsCached(
			databases,
			platform?.env?.CACHE,
			{
				country,
				category: url.searchParams.get('category'),
				nature: url.searchParams.get('nature'),
				district: url.searchParams.get('district'),
				division: url.searchParams.get('division'),
				present_in: url.searchParams.get('present_in')
			},
			deploymentVersion(platform?.env as Record<string, unknown> | undefined)
		);
		return { explore };
	} catch (cause) {
		if (cause instanceof RegenerationInProgressError) {
			error(503, 'Data is being refreshed, try again in a minute.');
		}
		throw cause;
	}
};
