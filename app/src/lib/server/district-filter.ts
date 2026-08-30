// SPDX-License-Identifier: Apache-2.0
/**
 * Is this district or division one the data actually carries?
 *
 * The search filter matches a district or a division exactly, so a near miss ("Kampala District",
 * "Nairobi") returned nothing and said nothing about why. Callers ask here first: a page can show
 * the nearest published values, and a tool result can hand the same list back to a model instead
 * of letting it conclude the business does not exist.
 */

import { listFacetsCached } from './facets';
import { nearestValues } from '$lib/nearest';
import type { AtlasDatabases } from './platform';

export interface DistrictCheck {
	known: boolean;
	suggestions: string[];
}

export async function checkDistrictFilter(
	databases: AtlasDatabases,
	country: string | null | undefined,
	district: string | null | undefined,
	cache?: KVNamespace,
	versionId: string | null = null
): Promise<DistrictCheck> {
	const wanted = district?.trim();
	if (!wanted) return { known: true, suggestions: [] };

	const { facets } = await listFacetsCached(databases, cache, country, versionId);
	const published = [
		...facets.district.map((facet) => facet.value),
		...facets.division.map((facet) => facet.value)
	];
	const known = published.some((value) => value.toLowerCase() === wanted.toLowerCase());
	return { known, suggestions: known ? [] : nearestValues(wanted, published) };
}
