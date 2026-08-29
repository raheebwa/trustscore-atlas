import { getSources } from '$lib/server/atlas';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDatabase(platform, 'sources');
	const sources = await getSources(db);
	return { sources };
};
