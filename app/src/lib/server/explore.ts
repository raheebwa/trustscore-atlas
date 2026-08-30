/**
 * Segment explorer over the precomputed `segments` table (one row per
 * country, category, nature-or-any, district, division, register-or-any).
 * Nature and register have rollup rows (NULL) that count each business once;
 * category, district and division do not, so unfiltered dimensions are summed.
 * Every query is scoped to exactly one country; breakdowns never mix countries.
 */

import type { SegmentFilters } from '$lib/types';
import { getLiveRegenerationId, RegenerationInProgressError } from './atlas';
import type { AtlasDatabases } from './platform';

export const DEFAULT_COUNTRY = 'UG';

export type DistrictCount = { district: string | null; count: number };
export type DivisionCount = { division: string | null; count: number };
export type RegisterCount = { register: string; count: number };
export type KeyCount = { key: string | null; count: number };

export interface ExploreFilters extends SegmentFilters {
	country?: string | null;
}

export interface ExploreResponse {
	filters: ExploreFilters;
	countries: string[];
	total_count: number;
	counts_by_district: DistrictCount[];
	counts_by_division: DivisionCount[];
	counts_by_register: RegisterCount[];
	counts_by_category?: KeyCount[];
	counts_by_nature?: KeyCount[];
	search_link: string;
	export_link: string;
}

export interface ExploreFilterSql {
	whereClause: string;
	bindings: string[];
}

type RollupMode = 'rollup' | 'each';

interface FilterOptions {
	nature?: RollupMode;
	register?: RollupMode;
}

const FILTER_KEYS = ['category', 'nature', 'district', 'division', 'present_in'] as const;

/** Rows returned per breakdown; the page shows fewer, the API never more. */
const GROUP_LIMITS: Record<string, number> = {
	district: 200,
	division: 200,
	register: 50,
	sector_category: 100,
	sector_nature: 100
};

function cleanFilters(filters: ExploreFilters): ExploreFilters {
	const cleaned: ExploreFilters = {
		country: filters.country?.trim().toUpperCase() || DEFAULT_COUNTRY
	};
	for (const key of FILTER_KEYS) {
		const value = filters[key]?.trim();
		if (value) cleaned[key] = value;
	}
	return cleaned;
}

function buildClauses(filters: ExploreFilters, options: FilterOptions = {}): ExploreFilterSql {
	const clauses: string[] = ['country = ?'];
	const bindings: string[] = [filters.country ?? DEFAULT_COUNTRY];
	const exact = (column: string, value: string | null | undefined, collate = true) => {
		if (!value) return false;
		clauses.push(`${column} = ?${collate ? ' COLLATE NOCASE' : ''}`);
		bindings.push(value);
		return true;
	};
	exact('sector_category', filters.category);
	if (!exact('sector_nature', filters.nature)) {
		clauses.push(options.nature === 'each' ? 'sector_nature IS NOT NULL' : 'sector_nature IS NULL');
	}
	exact('district', filters.district);
	exact('division', filters.division);
	if (!exact('register', filters.present_in, false)) {
		clauses.push(options.register === 'each' ? 'register IS NOT NULL' : 'register IS NULL');
	}
	return { whereClause: ` WHERE ${clauses.join(' AND ')}`, bindings };
}

export function buildExploreFilter(filters: ExploreFilters): ExploreFilterSql {
	return buildClauses(cleanFilters(filters));
}

function buildLink(
	path: string,
	filters: ExploreFilters,
	options: { country?: boolean; extra?: Record<string, string> } = {}
): string {
	const params = new URLSearchParams();
	if (options.country && filters.country) params.set('country', filters.country);
	for (const key of FILTER_KEYS) {
		const value = filters[key];
		if (value) params.set(key, value);
	}
	for (const [key, value] of Object.entries(options.extra ?? {})) params.set(key, value);
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}

async function groupCounts(
	db: D1Database,
	column: string,
	filters: ExploreFilters,
	options: FilterOptions = {}
): Promise<KeyCount[]> {
	const { whereClause, bindings } = buildClauses(filters, options);
	const limit = GROUP_LIMITS[column] ?? 100;
	const { results } = await db
		.prepare(
			`SELECT ${column} AS key, SUM(business_count) AS count FROM segments${whereClause}
			 GROUP BY ${column} COLLATE NOCASE ORDER BY count DESC, key ASC LIMIT ${limit}`
		)
		.bind(...bindings)
		.all<KeyCount>();
	return results ?? [];
}

export async function exploreSegments(
	{ db }: AtlasDatabases,
	inputFilters: ExploreFilters
): Promise<ExploreResponse> {
	const filters = cleanFilters(inputFilters);
	const liveBefore = await getLiveRegenerationId(db);
	const { whereClause, bindings } = buildClauses(filters);
	const [countriesResult, totalRow, districts, divisions, registers, categoriesOrNatures] =
		await Promise.all([
			db.prepare('SELECT DISTINCT country FROM segments').bind().all<{ country: string }>(),
			db
				.prepare(`SELECT COALESCE(SUM(business_count), 0) AS n FROM segments${whereClause}`)
				.bind(...bindings)
				.first<{ n: number }>(),
			groupCounts(db, 'district', filters),
			filters.district ? groupCounts(db, 'division', filters) : Promise.resolve([]),
			groupCounts(db, 'register', filters, { register: 'each' }),
			filters.category
				? groupCounts(db, 'sector_nature', filters, { nature: 'each' })
				: groupCounts(db, 'sector_category', filters)
		]);
	// The table swap is atomic per database, but these reads are not one snapshot; a swap in
	// between would mix two regenerations, so the caller retries instead (503).
	if ((await getLiveRegenerationId(db)) !== liveBefore) throw new RegenerationInProgressError();

	const response: ExploreResponse = {
		filters,
		countries: (countriesResult.results ?? []).map((row) => row.country),
		total_count: totalRow?.n ?? 0,
		counts_by_district: districts.map(({ key, count }) => ({ district: key, count })),
		counts_by_division: divisions.map(({ key, count }) => ({ division: key, count })),
		counts_by_register: registers
			.filter((row): row is { key: string; count: number } => row.key !== null)
			.map(({ key, count }) => ({ register: key, count })),
		search_link: buildLink('/search', filters),
		export_link: buildLink('/api/v1/explore', filters, { country: true, extra: { format: 'csv' } })
	};
	if (filters.category) response.counts_by_nature = categoriesOrNatures;
	else response.counts_by_category = categoriesOrNatures;
	return response;
}

function csvCell(value: string | null): string {
	let text = value ?? '(unknown)';
	// A leading formula character would run in a spreadsheet; a quote prefix keeps it text.
	const formula = /^[=+\-@\t\r]/.test(text);
	if (formula) text = `'${text}`;
	return formula || /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** District breakdown as CSV, the explorer's export (docs/PRD.md section 10.1). */
export function exploreCsv(response: ExploreResponse): string {
	const lines = ['district,business_count'];
	for (const row of response.counts_by_district) {
		lines.push(`${csvCell(row.district)},${row.count}`);
	}
	return lines.join('\r\n') + '\r\n';
}

const CACHE_TTL_SECONDS = 86400;

/**
 * The explorer answer is immutable for a regeneration, so it is cached in KV under the live
 * regeneration id and the cleaned filters; a new regeneration changes the key.
 */
export async function exploreSegmentsCached(
	databases: AtlasDatabases,
	cache: KVNamespace | undefined,
	inputFilters: ExploreFilters
): Promise<ExploreResponse> {
	const filters = cleanFilters(inputFilters);
	const liveId = cache ? await getLiveRegenerationId(databases.db) : null;
	const key = liveId
		? `explore:${liveId}:${[filters.country, filters.category, filters.nature, filters.district, filters.division, filters.present_in].map((v) => v ?? '').join('|')}`
		: null;
	if (key) {
		try {
			const hit = await cache!.get(key);
			if (hit) return JSON.parse(hit) as ExploreResponse;
		} catch {
			// A cache failure only costs the queries below.
		}
	}
	const response = await exploreSegments(databases, filters);
	if (key) {
		try {
			await cache!.put(key, JSON.stringify(response), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {
			// Same: the page still answers from the database.
		}
	}
	return response;
}
