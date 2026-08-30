/**
 * The value sets behind the search filters: district, division, sector category, sector nature
 * and register, each with the number of businesses it holds, for one country and one
 * regeneration. Filters offer only values that exist in the published data, so a chosen filter
 * can never land on an empty page.
 *
 * Counts come from the precomputed `segments` table through the same rollup rules the explorer
 * uses, so a business is counted once per dimension.
 */

import { getLiveRegenerationId, RegenerationInProgressError } from './atlas';
import { cacheScope } from './cache-scope';
import { DEFAULT_COUNTRY, segmentGroupCounts } from './explore';
import type { AtlasDatabases } from './platform';

export interface FacetValue {
	value: string;
	count: number;
}

export interface FacetsResponse {
	country: string;
	regeneration_id: string | null;
	facets: {
		district: FacetValue[];
		division: FacetValue[];
		sector_category: FacetValue[];
		sector_nature: FacetValue[];
		register: FacetValue[];
	};
}

function normaliseCountry(country: string | null | undefined): string {
	return country?.trim().toUpperCase() || DEFAULT_COUNTRY;
}

/** A filter cannot select "no value", so unpublished values stay out of the list. */
function values(rows: { key: string | null; count: number }[]): FacetValue[] {
	return rows
		.filter((row): row is { key: string; count: number } => Boolean(row.key))
		.map((row) => ({ value: row.key, count: row.count }));
}

export async function listFacets(
	{ db }: AtlasDatabases,
	country?: string | null
): Promise<FacetsResponse> {
	const filters = { country: normaliseCountry(country) };
	const liveBefore = await getLiveRegenerationId(db);
	const [district, division, category, nature, register] = await Promise.all([
		segmentGroupCounts(db, 'district', filters),
		segmentGroupCounts(db, 'division', filters),
		segmentGroupCounts(db, 'sector_category', filters),
		segmentGroupCounts(db, 'sector_nature', filters, { nature: 'each' }),
		segmentGroupCounts(db, 'register', filters, { register: 'each' })
	]);
	// Five reads are not one snapshot; a swap between them would mix regenerations.
	if ((await getLiveRegenerationId(db)) !== liveBefore) throw new RegenerationInProgressError();

	return {
		country: filters.country,
		regeneration_id: liveBefore,
		facets: {
			district: values(district),
			division: values(division),
			sector_category: values(category),
			sector_nature: values(nature),
			register: values(register)
		}
	};
}

const CACHE_TTL_SECONDS = 86400;

/**
 * The value sets are immutable for a regeneration, so they are cached in KV under the live
 * regeneration, the deployment version and the country.
 */
export async function listFacetsCached(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	country?: string | null,
	versionId: string | null = null
): Promise<FacetsResponse> {
	const normalised = normaliseCountry(country);
	const liveId = cache ? await getLiveRegenerationId(databases.db) : null;
	const key = liveId ? `facets:${cacheScope(liveId, versionId)}:${normalised}` : null;
	if (key) {
		try {
			const hit = await cache!.get(key);
			if (hit) return JSON.parse(hit) as FacetsResponse;
		} catch {
			// A cache failure only costs the queries below.
		}
	}
	const response = await listFacets(databases, normalised);
	if (key) {
		try {
			await cache!.put(key, JSON.stringify(response), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {
			// Same: the answer still comes from the database.
		}
	}
	return response;
}
