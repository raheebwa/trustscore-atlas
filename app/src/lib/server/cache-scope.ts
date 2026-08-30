// SPDX-License-Identifier: Apache-2.0
/**
 * Every KV cache key carries the live regeneration id and the deployment version, so a new
 * regeneration or a new build never serves an answer shaped by the previous code.
 */
export function cacheScope(liveId: string, versionId: string | null | undefined): string {
	return `${liveId}:${versionId?.trim() || 'dev'}`;
}

export function deploymentVersion(env: Record<string, unknown> | undefined): string | null {
	const metadata = env?.CF_VERSION_METADATA as { id?: unknown } | undefined;
	return typeof metadata?.id === 'string' ? metadata.id : null;
}
