import { searchBusinesses } from '$lib/server/atlas';
import { InvalidCursorError } from '$lib/pagination';
import { apiBadRequest, apiOptions, apiResponse, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const db = getDatabase(platform, 'businesses');
		const q = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const district = url.searchParams.get('district');
		const cursor = url.searchParams.get('cursor');
		const response = await searchBusinesses(db, { q, limit, district, cursor });
		return await apiResponse(db, request, url.pathname + url.search, response);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
