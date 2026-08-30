// SPDX-License-Identifier: Apache-2.0
/**
 * Derives a stable ETag from the live regeneration id, the deployment version and a request path
 * (docs/ARCHITECTURE.md section 9: "All reads carry ETag derived from the live regeneration id").
 * Two requests for the same path against the same regeneration and build produce the same ETag.
 *
 * The deployment version is part of the key because the body's shape belongs to the code, not to
 * the data: a build that adds a field to a response would otherwise answer 304 to every client
 * holding the previous tag, and they would keep reading a body that no longer matches the API.
 */

import { cacheScope } from './cache-scope';

// FNV-1a: a fast, deterministic fingerprint. Not a security hash, just a cache key.
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveEtag(
	liveRegenerationId: string,
	path: string,
	versionId: string | null | undefined
): string {
	return `"${fnv1a(`${cacheScope(liveRegenerationId, versionId)}:${path}`)}"`;
}
