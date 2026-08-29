import { error } from '@sveltejs/kit';
import { InvalidCursorError } from '$lib/pagination';
import { searchBusinesses } from '$lib/server/atlas';
import { FTS_MIN_QUERY_LENGTH, normalizeQuery } from '$lib/server/search';
import { getDatabase } from '$lib/server/platform';
import { findSegment } from '$lib/server/segments';
import type { SegmentFilters } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const db = getDatabase(platform, 'businesses');
	const rawQuery = url.searchParams.get('q') ?? '';
	const query = normalizeQuery(rawQuery);
	const district = normalizeQuery(url.searchParams.get('district') ?? '');
	const segmentFilters: SegmentFilters = {
		category: url.searchParams.get('category')?.trim() || null,
		nature: url.searchParams.get('nature')?.trim() || null,
		district: url.searchParams.get('district')?.trim() || null,
		division: url.searchParams.get('division')?.trim() || null,
		present_in: url.searchParams.get('present_in')?.trim() || null
	};
	const hasSegmentFilters = Object.values(segmentFilters).some(Boolean);

	if (query.length === 0) {
		return {
			query,
			district,
			results: null,
			segment: hasSegmentFilters ? await findSegment(db, segmentFilters) : null,
			segmentFilters,
			minLength: FTS_MIN_QUERY_LENGTH
		};
	}

	try {
		const response = await searchBusinesses(db, {
			q: query,
			district,
			cursor: url.searchParams.get('cursor')
		});
		return {
			query,
			district,
			results: response,
			segment: null,
			segmentFilters,
			minLength: FTS_MIN_QUERY_LENGTH
		};
	} catch (cause) {
		if (cause instanceof InvalidCursorError) error(400, 'Invalid search cursor.');
		throw cause;
	}
};
