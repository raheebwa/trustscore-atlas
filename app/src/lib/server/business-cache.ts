/**
 * The business page composes one record from five round trips across the three serving
 * databases. The composed result is immutable for a regeneration, so it is cached in KV under
 * the live regeneration id and the atlas id; a new regeneration changes the key.
 */

import { getBusinessDetail, getConsistentLiveRegenerationId, type BusinessDetail } from './atlas';
import { cacheScope } from './cache-scope';
import type { AtlasDatabases } from './platform';

const TTL_SECONDS = 86400;

export async function cachedBusinessDetail(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	atlasId: string,
	compose: (
		databases: AtlasDatabases,
		atlasId: string
	) => Promise<BusinessDetail | null> = getBusinessDetail,
	versionId: string | null = null
): Promise<BusinessDetail | null> {
	const liveId = await getConsistentLiveRegenerationId(databases);
	const key = liveId && cache ? `business:${cacheScope(liveId, versionId)}:${atlasId}` : null;
	if (key) {
		try {
			const hit = await cache!.get(key);
			if (hit) return JSON.parse(hit) as BusinessDetail;
		} catch {
			// A cache failure only costs the composition below.
		}
	}
	const detail = await compose(databases, atlasId);
	if (detail && key) {
		try {
			await cache!.put(key, JSON.stringify(detail), { expirationTtl: TTL_SECONDS });
		} catch {
			// Same: the page still answers from the databases.
		}
	}
	return detail;
}
