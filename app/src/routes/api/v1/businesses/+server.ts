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
import { requireDatabases } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const databases = requireDatabases(platform);
		const q = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const district = url.searchParams.get('district');
		const cursor = url.searchParams.get('cursor');
		const response = await searchBusinessesCached(databases, platform?.env?.CACHE, {
			q,
			limit,
			district,
			cursor
		});
		return await apiResponse(databases.db, request, url.pathname + url.search, response);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
