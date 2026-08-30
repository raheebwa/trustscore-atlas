// SPDX-License-Identifier: Apache-2.0
/**
 * Display rule for the capital: KCCA licenses businesses per division, and the five divisions
 * belong to Kampala district. District and division are resolved independently by precedence,
 * so a tax list can win the district (a head office elsewhere) while the trading licence wins
 * the division; showing "Nakawa Division, Wakiso" would misread. When the winning division is
 * one of the five KCCA divisions (packs/ug/pack.yml, boundaries.kcca_divisions), the displayed
 * district is Kampala. Display and coverage only; the resolver rule (district and division from
 * one winning source) is a Phase 1 item, see docs/adrs/0005-location-from-one-winning-source.md.
 */

export const KCCA_DIVISIONS = [
	'Central Division',
	'Kawempe Division',
	'Makindye Division',
	'Nakawa Division',
	'Rubaga Division'
] as const;

export function displayDistrict(
	district: string | null | undefined,
	division: string | null | undefined
): string | null {
	const key = division?.trim().toLowerCase();
	if (key && KCCA_DIVISIONS.some((name) => name.toLowerCase() === key)) return 'Kampala';
	return district ?? null;
}

/** Register countries this pack set publishes; an unlisted code shows as itself. */
const COUNTRY_NAMES: Record<string, string> = { UG: 'Uganda', KE: 'Kenya' };

export function countryName(code: string | null | undefined): string | null {
	const key = code?.trim().toUpperCase();
	if (!key) return null;
	return COUNTRY_NAMES[key] ?? key;
}

/**
 * One display line for a record's location. A pack whose registers publish no district or
 * division anywhere (Kenya's regulator directories today) can only say which country a record
 * sits in, and that is worth saying. Where the pack does publish locations, a record without one
 * is a gap in the data, not a country-level fact: 14,689 Ugandan records come from registers that
 * carry no address, and naming the country there would read as a published location.
 */
export function displayLocation(
	district: string | null | undefined,
	division: string | null | undefined,
	country: string | null | undefined,
	options: { countryPublishesFinerLocation?: boolean } = {}
): string {
	const resolvedDistrict = displayDistrict(district, division)?.trim() || null;
	const resolvedDivision = division?.trim() || null;
	if (resolvedDivision && resolvedDistrict) return `${resolvedDivision}, ${resolvedDistrict}`;
	if (resolvedDivision || resolvedDistrict) return (resolvedDivision ?? resolvedDistrict) as string;
	if (options.countryPublishesFinerLocation === false) {
		return countryName(country) ?? 'Location not published';
	}
	return 'Location not published';
}
