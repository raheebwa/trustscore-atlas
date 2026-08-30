import { getDownloads } from '$lib/server/downloads';
import { requireBucket } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	return { downloads: await getDownloads(requireBucket(platform), platform?.env?.CACHE) };
};
