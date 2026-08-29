import { getBusiness } from '$lib/server/atlas';
import { apiNotFound, apiOptions, apiResponse, apiServerError } from '$lib/server/api';
import { requireDb } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url, params }) => {
	try {
		const db = requireDb(platform);
		const record = await getBusiness(db, params.atlas_id);
		if (!record) {
			return apiNotFound(`No business found for atlas_id "${params.atlas_id}".`);
		}
		return await apiResponse(db, request, url.pathname, record);
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
