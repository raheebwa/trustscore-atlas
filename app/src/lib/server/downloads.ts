/**
 * Downloads read the published bundle in R2: `bundles/latest.json` names the regeneration,
 * `bundles/<id>/datapackage.json` describes every file (docs/PRD.md section 10.5).
 */

import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

export interface DataPackageResource {
	name: string;
	path: string;
	format?: string;
	mediatype?: string;
	bytes?: number;
	hash?: string;
	description?: string;
	licenses?: { name?: string; path?: string }[];
}

export interface DataPackage {
	name: string;
	version: string;
	created?: string;
	licenses?: { name?: string; path?: string }[];
	sources?: { title?: string; path?: string }[];
	resources: DataPackageResource[];
}

export interface DownloadItem extends DataPackageResource {
	href: ResolvedPathname;
	licence: string;
}

export interface Downloads {
	regeneration_id: string;
	created: string | null;
	canonical: DownloadItem[];
	sources: DownloadItem[];
	extras: { path: string; href: ResolvedPathname }[];
	total_bytes: number;
	licenses: { name?: string; path?: string }[];
}

const REGENERATION_ID = /^[0-9]{8}T[0-9]{6}Z$/;
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const EXTRA_FILES = ['datapackage.json', 'LICENSE', 'SOURCES.md', 'manifest.json'];

export function resolveDownloadKey(regenerationId: string, path: string): string | null {
	if (!REGENERATION_ID.test(regenerationId)) return null;
	if (!SAFE_PATH.test(path)) return null;
	if (path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
	return `bundles/${regenerationId}/${path}`;
}

function downloadHref(regenerationId: string, path: string): ResolvedPathname {
	return resolve('/downloads/[regeneration]/[...path]', { regeneration: regenerationId, path });
}

const LATEST_CACHE_KEY = 'downloads:latest';
const LATEST_TTL_SECONDS = 300;

/** Reads a small JSON object from R2 through KV; bundle contents never change, only the pointer. */
async function readJson(
	data: R2Bucket,
	cache: KVNamespace | undefined,
	objectKey: string,
	cacheKey: string,
	ttl?: number
): Promise<unknown> {
	if (cache) {
		try {
			const hit = await cache.get(cacheKey);
			if (hit) return JSON.parse(hit);
		} catch {
			// A cache failure only costs the R2 read below.
		}
	}
	const object = await data.get(objectKey);
	if (!object) return null;
	const text = await object.text();
	if (cache) {
		try {
			await cache.put(cacheKey, text, ttl ? { expirationTtl: ttl } : undefined);
		} catch {
			// Same: the page still answers from R2.
		}
	}
	return JSON.parse(text);
}

export async function getDownloads(data: R2Bucket, cache?: KVNamespace): Promise<Downloads | null> {
	const latest = (await readJson(
		data,
		cache,
		'bundles/latest.json',
		LATEST_CACHE_KEY,
		LATEST_TTL_SECONDS
	)) as { regeneration_id?: unknown } | null;
	if (!latest) return null;
	const regenerationId = typeof latest.regeneration_id === 'string' ? latest.regeneration_id : '';
	const packageKey = resolveDownloadKey(regenerationId, 'datapackage.json');
	if (!packageKey) return null;
	const pkg = (await readJson(
		data,
		cache,
		packageKey,
		`downloads:package:${regenerationId}`
	)) as DataPackage | null;
	if (!pkg) return null;
	const items = (pkg.resources ?? [])
		.filter((resource) => resolveDownloadKey(regenerationId, resource.path) !== null)
		.map((resource) => ({
			...resource,
			href: downloadHref(regenerationId, resource.path),
			licence: resource.licenses?.[0]?.name ?? pkg.licenses?.[0]?.name ?? 'see LICENSE'
		}));
	return {
		regeneration_id: regenerationId,
		created: pkg.created ?? null,
		canonical: items.filter((item) => item.path.startsWith('canonical/')),
		sources: items.filter((item) => item.path.startsWith('sources/')),
		extras: EXTRA_FILES.map((path) => ({ path, href: downloadHref(regenerationId, path) })),
		total_bytes: items.reduce((sum, item) => sum + (item.bytes ?? 0), 0),
		licenses: pkg.licenses ?? []
	};
}
