// SPDX-License-Identifier: Apache-2.0
import { deploymentVersion } from '$lib/server/cache-scope';
import { RegenerationInProgressError } from '$lib/server/atlas';
import {
	apiBadRequest,
	apiOptions,
	apiRegenerationInProgress,
	apiResponse,
	apiServerError
} from '$lib/server/api';
import { resolveCountry } from '$lib/server/packs';
import { requireDatabases } from '$lib/server/platform';
import { findSegment } from '$lib/server/segments';
import type { SegmentFilters } from '$lib/types';
import type { RequestHandler } from './$types';

const FILTER_NAMES = ['category', 'nature', 'district', 'division', 'present_in'] as const;

export const GET: RequestHandler = async ({ cookies, platform, request, url }) => {
	try {
		const filters: SegmentFilters = {};
		for (const name of FILTER_NAMES) {
			const value = url.searchParams.get(name)?.trim();
			if (!value) continue;
			if (value.length > 200) return apiBadRequest(`invalid ${name}`);
			filters[name] = value;
		}
		const databases = requireDatabases(platform);
		const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
		// A segment belongs to one pack, resolved the way every page resolves it.
		filters.country = await resolveCountry(
			databases,
			platform?.env?.CACHE,
			url.searchParams.get('country'),
			cookies.get('country'),
			version
		);
		const response = await findSegment(databases, filters);
		return await apiResponse(databases.db, request, url.pathname + url.search, response, version);
	} catch (err) {
		if (err instanceof RegenerationInProgressError) return apiRegenerationInProgress();
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
