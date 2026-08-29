import { RegenerationInProgressError, businessExists, getScore } from '$lib/server/atlas';
import {
	apiBadRequest,
	apiNotFound,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { requireDatabases } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url, params }) => {
	try {
		const rubric = url.searchParams.get('rubric')?.trim() ?? '';
		if (rubric.length === 0 || rubric.length > 100) return apiBadRequest('invalid rubric');
		const version = url.searchParams.get('version');
		const parsedVersion = version ? Number(version) : null;
		if (
			version &&
			(!/^\d+$/.test(version) ||
				parsedVersion === null ||
				!Number.isSafeInteger(parsedVersion) ||
				parsedVersion < 1)
		) {
			return apiBadRequest('invalid version');
		}

		const databases = requireDatabases(platform);
		if (!(await businessExists(databases.db, params.atlas_id))) {
			return apiNotFound('business_not_found');
		}
		const score = await getScore(databases, params.atlas_id, rubric, { version });
		if (!score) return apiNotFound('rubric_not_found');
		return await apiResponse(databases.db, request, url.pathname + url.search, score);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
