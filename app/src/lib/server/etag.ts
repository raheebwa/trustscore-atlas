/**
 * Derives a stable ETag from the live regeneration id and a request path
 * (docs/ARCHITECTURE.md section 9: "All reads carry ETag derived from the
 * live regeneration id"). Two requests for the same path against the same
 * regeneration produce the same ETag; a new regeneration changes it.
 */

// FNV-1a: a fast, deterministic fingerprint. Not a security hash, just a cache key.
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveEtag(liveRegenerationId: string, path: string): string {
	return `"${fnv1a(`${liveRegenerationId}:${path}`)}"`;
}
