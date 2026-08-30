// SPDX-License-Identifier: Apache-2.0
import { getHomeStats } from '$lib/server/atlas';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDatabase(platform, 'businesses');
	const stats = await getHomeStats(db);
	return { stats };
};
