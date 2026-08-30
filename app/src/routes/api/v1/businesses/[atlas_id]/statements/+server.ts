// SPDX-License-Identifier: Apache-2.0
import { deploymentVersion } from '$lib/server/cache-scope';
import { RegenerationInProgressError, businessExists, getStatementsPage } from '$lib/server/atlas';
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
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		if (!(await businessExists(databases.db, params.atlas_id))) {
			return apiNotFound(`No business found for atlas_id "${params.atlas_id}".`);
		}
		const field = url.searchParams.get('field');
		if (field && field.length > 200) return apiBadRequest('invalid field');
		const page = await getStatementsPage(databases, params.atlas_id, {
			field,
			limit: url.searchParams.get('limit'),
			cursor: url.searchParams.get('cursor')
		});
		return await apiResponse(databases.db, request, url.pathname + url.search, page, version);
	} catch (err) {
		if (err instanceof InvalidCursorError) return apiBadRequest('invalid cursor');
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
