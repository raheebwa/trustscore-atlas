// SPDX-License-Identifier: Apache-2.0
/**
 * Search answers are immutable for a regeneration, so a query is cached in KV under the
 * live regeneration id and its normalised options; a new regeneration changes the key.
 */

import { getLiveRegenerationId, searchBusinesses, type SearchOptions } from './atlas';
import { cacheScope } from './cache-scope';
import type { AtlasDatabases } from './platform';
import type { SearchResponse } from '$lib/types';

const TTL_SECONDS = 86400;

function cacheKey(scope: string, options: SearchOptions): string {
	const parts = [
		options.q.trim().toLowerCase(),
		(options.district ?? '').trim().toLowerCase(),
		options.limit == null ? '' : String(options.limit),
		options.cursor ?? ''
	];
	return `search:${scope}:${JSON.stringify(parts)}`;
}

export async function searchBusinessesCached(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	options: SearchOptions,
	search: (
		databases: AtlasDatabases,
		options: SearchOptions
	) => Promise<SearchResponse> = searchBusinesses,
	versionId: string | null = null
): Promise<SearchResponse> {
	const liveId = cache ? await getLiveRegenerationId(databases.db) : null;
	const key = liveId ? cacheKey(cacheScope(liveId, versionId), options) : null;
	if (key) {
		try {
			const hit = await cache!.get(key);
			if (hit) return JSON.parse(hit) as SearchResponse;
		} catch {
			// A cache failure only costs the search below.
		}
	}
	const response = await search(databases, options);
	if (key) {
		try {
			await cache!.put(key, JSON.stringify(response), { expirationTtl: TTL_SECONDS });
		} catch {
			// Same: the page still answers from the databases.
		}
	}
	return response;
}
