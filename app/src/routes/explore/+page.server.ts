import { exploreSegments } from '$lib/server/explore';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const databases = requireDatabases(platform);
	const explore = await exploreSegments(databases, {
		category: url.searchParams.get('category'),
		nature: url.searchParams.get('nature'),
		district: url.searchParams.get('district'),
		division: url.searchParams.get('division'),
		present_in: url.searchParams.get('present_in')
	});
	return { explore };
};
