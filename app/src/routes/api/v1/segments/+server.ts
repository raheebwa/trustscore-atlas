import { apiBadRequest, apiOptions, apiResponse, apiServerError } from '$lib/server/api';
import { getDatabase } from '$lib/server/platform';
import { findSegment } from '$lib/server/segments';
import type { SegmentFilters } from '$lib/types';
import type { RequestHandler } from './$types';

const FILTER_NAMES = ['category', 'nature', 'district', 'division', 'present_in'] as const;

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const filters: SegmentFilters = {};
		for (const name of FILTER_NAMES) {
			const value = url.searchParams.get(name)?.trim();
			if (!value) continue;
			if (value.length > 200) return apiBadRequest(`invalid ${name}`);
			filters[name] = value;
		}
		const db = getDatabase(platform, 'businesses');
		const response = await findSegment(db, filters);
		return await apiResponse(db, request, url.pathname + url.search, response);
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
