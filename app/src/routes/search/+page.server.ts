import { error } from '@sveltejs/kit';
import { InvalidCursorError } from '$lib/pagination';
import { searchBusinesses } from '$lib/server/atlas';
import { FTS_MIN_QUERY_LENGTH, normalizeQuery } from '$lib/server/search';
import { getDatabase } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const db = getDatabase(platform, 'businesses');
	const rawQuery = url.searchParams.get('q') ?? '';
	const query = normalizeQuery(rawQuery);
	const district = normalizeQuery(url.searchParams.get('district') ?? '');

	if (query.length === 0) {
		return { query, district, results: null, minLength: FTS_MIN_QUERY_LENGTH };
	}

	try {
		const response = await searchBusinesses(db, {
			q: query,
			district,
			cursor: url.searchParams.get('cursor')
		});
		return { query, district, results: response, minLength: FTS_MIN_QUERY_LENGTH };
	} catch (cause) {
		if (cause instanceof InvalidCursorError) error(400, 'Invalid search cursor.');
		throw cause;
	}
};
