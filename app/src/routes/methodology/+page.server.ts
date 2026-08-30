import { getMethodology } from '$lib/server/methodology';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDatabase(platform, 'methodology');
	return { methodology: await getMethodology(db) };
};
