/**
 * Downloads read the published bundle in R2: `bundles/latest.json` names the regeneration,
 * `bundles/<id>/datapackage.json` describes every file (docs/PRD.md section 10.5).
 */

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
	href: string;
	licence: string;
}

export interface Downloads {
	regeneration_id: string;
	created: string | null;
	canonical: DownloadItem[];
	sources: DownloadItem[];
	extras: { path: string; href: string }[];
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

function downloadHref(regenerationId: string, path: string): string {
	return `/downloads/${regenerationId}/${path}`;
}

export async function getDownloads(data: R2Bucket): Promise<Downloads | null> {
	const pointer = await data.get('bundles/latest.json');
	if (!pointer) return null;
	const latest = (await pointer.json()) as { regeneration_id?: unknown };
	const regenerationId = typeof latest.regeneration_id === 'string' ? latest.regeneration_id : '';
	const packageKey = resolveDownloadKey(regenerationId, 'datapackage.json');
	if (!packageKey) return null;
	const object = await data.get(packageKey);
	if (!object) return null;
	const pkg = (await object.json()) as DataPackage;
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
