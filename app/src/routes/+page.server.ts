import { getHomeStats } from '$lib/server/atlas';
import { requireDb } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	const stats = await getHomeStats(db);
	return { stats };
};
