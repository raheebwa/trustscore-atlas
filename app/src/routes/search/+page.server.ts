import { deploymentVersion } from '$lib/server/cache-scope';
import { error } from '@sveltejs/kit';
import { InvalidCursorError } from '$lib/pagination';
import { RegenerationInProgressError } from '$lib/server/atlas';
import { listFacetsCached } from '$lib/server/facets';
import { searchBusinessesCached } from '$lib/server/search-cache';
import { FTS_MIN_QUERY_LENGTH, normalizeQuery } from '$lib/server/search';
import { requireDatabases } from '$lib/server/platform';
import { findSegment } from '$lib/server/segments';
import type { SegmentFilters } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const databases = requireDatabases(platform);
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
	const country = url.searchParams.get('country');
	const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
	// The filter controls offer published values only, so a chosen filter always has results.
	const facetsPromise = listFacetsCached(databases, platform?.env?.CACHE, country, version);

	try {
		if (query.length === 0) {
			return {
				query,
				district,
				results: null,
				segment: hasSegmentFilters ? await findSegment(databases, segmentFilters) : null,
				segmentFilters,
				facets: (await facetsPromise).facets,
				minLength: FTS_MIN_QUERY_LENGTH
			};
		}

		const response = await searchBusinessesCached(
			databases,
			platform?.env?.CACHE,
			{
				q: query,
				district,
				cursor: url.searchParams.get('cursor')
			},
			undefined,
			version
		);
		return {
			query,
			district,
			results: response,
			segment: null,
			segmentFilters,
			facets: (await facetsPromise).facets,
			minLength: FTS_MIN_QUERY_LENGTH
		};
	} catch (cause) {
		if (cause instanceof InvalidCursorError) error(400, 'Invalid search cursor.');
		if (cause instanceof RegenerationInProgressError) {
			error(503, 'Data is being refreshed, try again in a minute.');
		}
		throw cause;
	}
};
