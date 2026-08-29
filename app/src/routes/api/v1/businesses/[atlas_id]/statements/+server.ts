import { businessExists, getStatementsPage } from '$lib/server/atlas';
import { InvalidCursorError } from '$lib/pagination';
import {
	apiBadRequest,
	apiNotFound,
	apiOptions,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { requireDb } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url, params }) => {
	try {
		const db = requireDb(platform);
		if (!(await businessExists(db, params.atlas_id))) {
			return apiNotFound(`No business found for atlas_id "${params.atlas_id}".`);
		}
		const field = url.searchParams.get('field');
		if (field && field.length > 200) return apiBadRequest('invalid field');
		const page = await getStatementsPage(db, params.atlas_id, {
			field,
			limit: url.searchParams.get('limit'),
			cursor: url.searchParams.get('cursor')
		});
		return await apiResponse(db, request, url.pathname + url.search, page);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
