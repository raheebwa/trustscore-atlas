import { RegenerationInProgressError } from '$lib/server/atlas';
import {
	apiBadRequest,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { deploymentVersion } from '$lib/server/cache-scope';
import { listFacetsCached } from '$lib/server/facets';
import { requireDatabases } from '$lib/server/platform';
import type { RequestHandler } from './$types';

/** The value sets the search filters offer, per country and regeneration. */
export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const country = url.searchParams.get('country')?.trim();
		if (country && !/^[A-Za-z]{2}$/.test(country)) return apiBadRequest('invalid country');
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		const response = await listFacetsCached(databases, platform?.env?.CACHE, country, version);
		return await apiResponse(databases.db, request, url.pathname + url.search, response, version);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
