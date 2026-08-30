/**
 * Segment explorer over the precomputed `segments` table (one row per
 * category, nature-or-any, district, division, register-or-any). Nature and
 * register have rollup rows (NULL) that count each business once; category,
 * district and division do not, so unfiltered dimensions are summed.
 */

import type { SegmentFilters } from '$lib/types';
import type { AtlasDatabases } from './platform';

export type DistrictCount = { district: string | null; count: number };
export type DivisionCount = { division: string | null; count: number };
export type RegisterCount = { register: string; count: number };
export type KeyCount = { key: string | null; count: number };

export interface ExploreResponse {
	filters: SegmentFilters;
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

function cleanFilters(filters: SegmentFilters): SegmentFilters {
	const cleaned: SegmentFilters = {};
	for (const key of FILTER_KEYS) {
		const value = filters[key]?.trim();
		if (value) cleaned[key] = value;
	}
	return cleaned;
}

function buildClauses(filters: SegmentFilters, options: FilterOptions = {}): ExploreFilterSql {
	const clauses: string[] = [];
	const bindings: string[] = [];
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

export function buildExploreFilter(filters: SegmentFilters): ExploreFilterSql {
	return buildClauses(cleanFilters(filters));
}

function buildLink(path: string, filters: SegmentFilters, extra?: Record<string, string>): string {
	const params = new URLSearchParams();
	for (const key of FILTER_KEYS) {
		const value = filters[key];
		if (value) params.set(key, value);
	}
	for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}

async function groupCounts(
	db: D1Database,
	column: string,
	filters: SegmentFilters,
	options: FilterOptions = {}
): Promise<KeyCount[]> {
	const { whereClause, bindings } = buildClauses(filters, options);
	const { results } = await db
		.prepare(
			`SELECT ${column} AS key, SUM(business_count) AS count FROM segments${whereClause}
			 GROUP BY ${column} ORDER BY count DESC, ${column} ASC`
		)
		.bind(...bindings)
		.all<KeyCount>();
	return results ?? [];
}

export async function exploreSegments(
	{ db }: AtlasDatabases,
	inputFilters: SegmentFilters
): Promise<ExploreResponse> {
	const filters = cleanFilters(inputFilters);
	const { whereClause, bindings } = buildClauses(filters);
	const [totalRow, districts, divisions, registers, categoriesOrNatures] = await Promise.all([
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
	const response: ExploreResponse = {
		filters,
		total_count: totalRow?.n ?? 0,
		counts_by_district: districts.map(({ key, count }) => ({ district: key, count })),
		counts_by_division: divisions.map(({ key, count }) => ({ division: key, count })),
		counts_by_register: registers
			.filter((row): row is { key: string; count: number } => row.key !== null)
			.map(({ key, count }) => ({ register: key, count })),
		search_link: buildLink('/search', filters),
		export_link: buildLink('/api/v1/explore', filters, { format: 'csv' })
	};
	if (filters.category) response.counts_by_nature = categoriesOrNatures;
	else response.counts_by_category = categoriesOrNatures;
	return response;
}

function csvCell(value: string | null): string {
	const text = value ?? '(unknown)';
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** District breakdown as CSV, the explorer's export (docs/PRD.md section 10.1). */
export function exploreCsv(response: ExploreResponse): string {
	const lines = ['district,business_count'];
	for (const row of response.counts_by_district) {
		lines.push(`${csvCell(row.district)},${row.count}`);
	}
	return lines.join('\r\n') + '\r\n';
}
