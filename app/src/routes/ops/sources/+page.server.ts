import { getSources } from '$lib/server/atlas';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDatabase(platform, 'sources');
	return { sources: await getSources(db) };
};
