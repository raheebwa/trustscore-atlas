// SPDX-License-Identifier: Apache-2.0
import { deploymentVersion } from '$lib/server/cache-scope';
import { RegenerationInProgressError } from '$lib/server/atlas';
import { searchBusinessesCached } from '$lib/server/search-cache';
import { InvalidCursorError } from '$lib/pagination';
import {
	apiBadRequest,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { checkDistrictFilter } from '$lib/server/district-filter';
import { requireDatabases } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		const q = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const district = url.searchParams.get('district');
		const cursor = url.searchParams.get('cursor');
		const country = url.searchParams.get('country');
		// A district the data does not carry is a dead end unless the answer says what it does
		// carry, so the check runs before the search rather than after an empty result.
		const districtCheck = await checkDistrictFilter(
			databases,
			country,
			district,
			platform?.env?.CACHE,
			version
		);
		if (!districtCheck.known) {
			return await apiResponse(
				databases.db,
				request,
				url.pathname + url.search,
				{
					query: q,
					district,
					total_count: 0,
					returned: 0,
					page_returned: 0,
					limit: 0,
					offset: 0,
					regeneration_id: null,
					next_cursor: null,
					results: [],
					district_known: false,
					nearest_districts: districtCheck.suggestions
				},
				version
			);
		}
		const response = await searchBusinessesCached(
			databases,
			platform?.env?.CACHE,
			{ q, limit, district, cursor },
			undefined,
			version
		);
		return await apiResponse(databases.db, request, url.pathname + url.search, response, version);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
