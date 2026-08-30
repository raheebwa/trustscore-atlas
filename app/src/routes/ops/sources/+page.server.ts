import { getSources } from '$lib/server/atlas';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, parent }) => {
	await parent();
	const db = getDatabase(platform, 'sources');
	return { sources: await getSources(db) };
};
