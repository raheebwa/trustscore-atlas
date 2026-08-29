import { getSources } from '$lib/server/atlas';
import { apiOptions, apiResponse, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const db = getDatabase(platform, 'sources');
		const sources = await getSources(db);
		return await apiResponse(db, request, url.pathname, { sources });
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
