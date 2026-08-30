import { deploymentVersion } from '$lib/server/cache-scope';
import { RegenerationInProgressError, getBusiness } from '$lib/server/atlas';
import {
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
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		const record = await getBusiness(databases, params.atlas_id);
		if (!record) {
			return apiNotFound(`No business found for atlas_id "${params.atlas_id}".`);
		}
		return await apiResponse(databases.db, request, url.pathname, record, version);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
