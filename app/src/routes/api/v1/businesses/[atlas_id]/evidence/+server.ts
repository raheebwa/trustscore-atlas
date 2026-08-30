// SPDX-License-Identifier: Apache-2.0
import { deploymentVersion } from '$lib/server/cache-scope';
import {
	RegenerationInProgressError,
	businessExists,
	getFieldEvidencePage,
	getRubricEvidencePage
} from '$lib/server/atlas';
import { InvalidCursorError } from '$lib/pagination';
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
		const field = url.searchParams.get('field')?.trim() || null;
		const rubric = url.searchParams.get('rubric')?.trim() || null;
		if ((field === null) === (rubric === null)) {
			return apiBadRequest('provide exactly one of field or rubric');
		}
		if ((field?.length ?? 0) > 200 || (rubric?.length ?? 0) > 100) {
			return apiBadRequest('invalid evidence selector');
		}

		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		if (!(await businessExists(databases.db, params.atlas_id))) {
			return apiNotFound('business_not_found');
		}
		const options = {
			limit: url.searchParams.get('limit'),
			cursor: url.searchParams.get('cursor')
		};
		const evidence = field
			? await getFieldEvidencePage(databases, params.atlas_id, field, options)
			: await getRubricEvidencePage(databases, params.atlas_id, rubric as string, options);
		if (!evidence) return apiNotFound('rubric_not_found');
		return await apiResponse(databases.db, request, url.pathname + url.search, evidence, version);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
