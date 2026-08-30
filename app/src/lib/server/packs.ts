// SPDX-License-Identifier: Apache-2.0
/**
 * The loaded country packs, for the header's country switch and the home page's pack strip.
 *
 * The list is read from the data, never from a list of countries in the code: a pack that lands
 * in a regeneration appears here on its own, and nothing in the interface has to be rewritten to
 * name it. The published methodology supplies each pack's own name where it has one.
 */

import { countryName } from '$lib/location';
import { getLiveRegenerationId } from './atlas';
import { cacheScope } from './cache-scope';
import { getMetaValue } from './atlas';
import type { AtlasDatabases } from './platform';

export interface Pack {
	code: string;
	name: string;
	businesses: number;
}

const CACHE_TTL_SECONDS = 86400;

function packNames(published: string | null): Record<string, string> {
	if (!published) return {};
	try {
		const parsed = JSON.parse(published) as { packs?: Record<string, { name?: unknown }> };
		const names: Record<string, string> = {};
		for (const [code, pack] of Object.entries(parsed.packs ?? {})) {
			if (typeof pack?.name === 'string' && pack.name.trim()) names[code] = pack.name.trim();
		}
		return names;
	} catch {
		// A malformed methodology row costs the pack its own name, nothing more.
		return {};
	}
}

export async function listPacks({ db }: AtlasDatabases): Promise<Pack[]> {
	const [published, counts] = await Promise.all([
		getMetaValue(db, 'methodology'),
		db
			.prepare('SELECT country, COUNT(*) AS businesses FROM businesses GROUP BY country')
			.bind()
			.all<{ country: string; businesses: number }>()
	]);
	const names = packNames(published);
	return (counts.results ?? [])
		.map((row) => ({
			code: row.country,
			name: names[row.country] ?? countryName(row.country) ?? row.country,
			businesses: row.businesses
		}))
		.sort((a, b) => b.businesses - a.businesses || a.code.localeCompare(b.code));
}

export async function listPacksCached(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	versionId: string | null = null
): Promise<Pack[]> {
	const liveId = cache ? await getLiveRegenerationId(databases.db) : null;
	const key = liveId ? `packs:${cacheScope(liveId, versionId)}` : null;
	if (key) {
		try {
			const hit = await cache!.get(key);
			if (hit) return JSON.parse(hit) as Pack[];
		} catch {
			// A cache failure only costs the two queries below.
		}
	}
	const packs = await listPacks(databases);
	if (key) {
		try {
			await cache!.put(key, JSON.stringify(packs), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {
			// Same: the page still answers from the database.
		}
	}
	return packs;
}

/**
 * The country pack a request is scoped to: what the URL asked for, else what the visitor last
 * chose, else the largest pack. The layout, every page load and every API route resolve it the
 * same way, so a page and the API behind it never disagree about what "all businesses" means.
 */
export async function resolveCountry(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	requested: string | null | undefined,
	remembered: string | null | undefined,
	versionId: string | null = null
): Promise<string> {
	const packs = await listPacksCached(databases, cache, versionId);
	const codes = new Set(packs.map((pack) => pack.code));
	for (const candidate of [requested, remembered]) {
		const code = candidate?.trim().toUpperCase();
		if (code && codes.has(code)) return code;
	}
	return packs[0]?.code ?? 'UG';
}

/**
 * The atlas_id a record-shaped route is about, or null on every other surface. These routes are
 * addressed by the record itself, so they are the ones where the record can outrank the switch.
 */
function recordAtlasId(pathname: string): string | null {
	const [, section, id] = pathname.split('/');
	if (!id || (section !== 'b' && section !== 'claim')) return null;
	try {
		return decodeURIComponent(id);
	} catch {
		return null;
	}
}

/**
 * The country a page is scoped to.
 *
 * A record belongs to exactly one pack, so on its own pages the record decides: a link to a
 * Ugandan record opens in Uganda whatever the reader was last reading, and a country in the URL
 * that disagrees is ignored rather than refused. Every other surface keeps the switch as the
 * authority. `fromRecord` tells the caller the scope moved, which is what makes the switch and
 * the remembered country follow it instead of quietly disagreeing with the page.
 */
export async function resolveScopeCountry(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	options: {
		pathname: string;
		requested?: string | null;
		remembered?: string | null;
		versionId?: string | null;
	}
): Promise<{ country: string; fromRecord: boolean }> {
	const atlasId = recordAtlasId(options.pathname);
	if (atlasId) {
		const record = await databases.db
			.prepare('SELECT country FROM businesses WHERE atlas_id = ?')
			.bind(atlasId)
			.first<{ country: string | null }>();
		const code = record?.country?.trim().toUpperCase();
		if (code) {
			const packs = await listPacksCached(databases, cache, options.versionId ?? null);
			if (packs.some((pack) => pack.code === code)) return { country: code, fromRecord: true };
		}
	}

	return {
		country: await resolveCountry(
			databases,
			cache,
			options.requested,
			options.remembered,
			options.versionId ?? null
		),
		fromRecord: false
	};
}

export interface BoundaryMap {
	level: string;
	asset: string;
	object: string;
	attribution?: string;
}

/**
 * The map a pack declares for the explorer, read from the published methodology. A pack without
 * one gets no map: an explorer that draws Uganda's districts while the switch says Kenya is
 * worse than an explorer with no picture at all.
 */
export async function packBoundaryMap(
	{ db }: AtlasDatabases,
	country: string
): Promise<BoundaryMap | null> {
	const published = await getMetaValue(db, 'methodology');
	if (!published) return null;
	try {
		const parsed = JSON.parse(published) as {
			packs?: Record<string, { boundaries_map?: Partial<BoundaryMap> | null }>;
		};
		const map = parsed.packs?.[country.toUpperCase()]?.boundaries_map;
		if (!map?.asset || !map.object) return null;
		return {
			level: map.level ?? '',
			asset: map.asset,
			object: map.object,
			attribution: map.attribution
		};
	} catch {
		return null;
	}
}
