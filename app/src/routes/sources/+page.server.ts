// SPDX-License-Identifier: Apache-2.0
/**
 * The registers behind the pack in view. The country switch scopes this page like every other:
 * a Kenyan reader asking what Atlas reads should not be handed Uganda's register list.
 */

import { getSources } from '$lib/server/atlas';
import { deploymentVersion } from '$lib/server/cache-scope';
import { resolveCountry } from '$lib/server/packs';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, platform, url }) => {
	const databases = requireDatabases(platform);
	const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
	const [sources, country] = await Promise.all([
		getSources(databases.db),
		resolveCountry(
			databases,
			platform?.env?.CACHE,
			url.searchParams.get('country'),
			cookies.get('country'),
			version
		)
	]);
	return { sources: sources.filter((source) => source.country === country) };
};
