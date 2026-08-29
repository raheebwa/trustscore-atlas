import { error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const db = getDatabase(platform, 'businesses');
	const business = await db
		.prepare('SELECT atlas_id, canonical_name FROM businesses WHERE atlas_id = ?')
		.bind(params.atlas_id)
		.first<{ atlas_id: string; canonical_name: string }>();
	if (!business) error(404, 'Business not found.');
	return { business };
};
