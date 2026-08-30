import { getLiveRegenerationId, RegenerationInProgressError } from '$lib/server/atlas';
import {
	apiBadRequest,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { deriveEtag } from '$lib/server/etag';
import { exploreCsv, exploreSegments, type ExploreFilters } from '$lib/server/explore';
import { requireDatabases } from '$lib/server/platform';
import type { RequestHandler } from './$types';

const FILTER_NAMES = [
	'country',
	'category',
	'nature',
	'district',
	'division',
	'present_in'
] as const;

export const GET: RequestHandler = async ({ platform, request, url }) => {
	try {
		const filters: ExploreFilters = {};
		for (const name of FILTER_NAMES) {
			const value = url.searchParams.get(name)?.trim();
			if (!value) continue;
			if (value.length > 200) return apiBadRequest(`invalid ${name}`);
			if (name === 'country' && !/^[A-Za-z]{2}$/.test(value))
				return apiBadRequest('invalid country');
			filters[name] = value;
		}
		const format = url.searchParams.get('format') ?? 'json';
		if (format !== 'json' && format !== 'csv') return apiBadRequest('invalid format');
		const databases = requireDatabases(platform);
		const response = await exploreSegments(databases, filters);
		if (format === 'csv') {
			const liveRegenerationId = (await getLiveRegenerationId(databases.db)) ?? 'unseeded';
			const etag = deriveEtag(liveRegenerationId, url.pathname + url.search);
			const headers = {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': 'attachment; filename="atlas-explore.csv"',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=60',
				ETag: etag
			};
			if (request.headers.get('if-none-match') === etag) {
				return new Response(null, { status: 304, headers });
			}
			return new Response(exploreCsv(response), { headers });
		}
		return await apiResponse(databases.db, request, url.pathname + url.search, response);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
