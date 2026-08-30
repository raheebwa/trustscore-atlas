import { apiBadRequest, apiOptions, apiResponse, apiServerError } from '$lib/server/api';
import { exploreCsv, exploreSegments } from '$lib/server/explore';
import { requireDatabases } from '$lib/server/platform';
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
		const format = url.searchParams.get('format') ?? 'json';
		if (format !== 'json' && format !== 'csv') return apiBadRequest('invalid format');
		const databases = requireDatabases(platform);
		const response = await exploreSegments(databases, filters);
		if (format === 'csv') {
			return new Response(exploreCsv(response), {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': 'attachment; filename="atlas-explore.csv"',
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'public, max-age=60'
				}
			});
		}
		return await apiResponse(databases.db, request, url.pathname + url.search, response);
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
