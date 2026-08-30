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
