// SPDX-License-Identifier: Apache-2.0
import { deploymentVersion } from '$lib/server/cache-scope';
import { RegenerationInProgressError, businessExists, getJoinedScore } from '$lib/server/atlas';
import { explainScore } from '$lib/score-explanation';
import {
	apiBadRequest,
	apiNotFound,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { requireDatabases } from '$lib/server/platform';
import type { ScoreExplanationResponse } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, request, url, params }) => {
	try {
		const rubric = url.searchParams.get('rubric')?.trim() ?? '';
		if (rubric.length === 0 || rubric.length > 100) return apiBadRequest('invalid rubric');
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		if (!(await businessExists(databases.db, params.atlas_id))) {
			return apiNotFound('business_not_found');
		}
		const joined = await getJoinedScore(databases, params.atlas_id, rubric);
		if (!joined) return apiNotFound('rubric_not_found');
		const response: ScoreExplanationResponse = {
			atlas_id: params.atlas_id,
			rubric,
			explanation: explainScore({
				rubric,
				checkable: joined.score.checkable,
				unknown: joined.score.unknown,
				evidence: joined.evidence
			})
		};
		return await apiResponse(databases.db, request, url.pathname + url.search, response, version);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
