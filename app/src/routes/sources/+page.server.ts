import { getSources } from '$lib/server/atlas';
import { requireDb } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	const sources = await getSources(db);
	return { sources };
};
