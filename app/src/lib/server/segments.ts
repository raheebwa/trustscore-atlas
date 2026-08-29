import { getLiveRegenerationId } from './atlas';
import type { SegmentFilters, SegmentResponse } from '$lib/types';

export interface SegmentFilterSql {
	whereClause: string;
	bindings: string[];
}

export function buildSegmentFilter(filters: SegmentFilters): SegmentFilterSql {
	const clauses: string[] = [];
	const bindings: string[] = [];
	const addExact = (column: string, value: string | null | undefined) => {
		const trimmed = value?.trim();
		if (!trimmed) return;
		clauses.push(`${column} = ? COLLATE NOCASE`);
		bindings.push(trimmed);
	};

	addExact('b.sector_category', filters.category);
	addExact('b.sector_nature', filters.nature);
	addExact('b.district', filters.district);
	addExact('b.division', filters.division);
	const presentIn = filters.present_in?.trim();
	if (presentIn) {
		clauses.push(
			"EXISTS (SELECT 1 FROM json_each(b.coverage, '$.found_in') AS coverage_register WHERE coverage_register.value = ?)"
		);
		bindings.push(presentIn);
	}

	return {
		whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
		bindings
	};
}

interface DivisionCountRow {
	division: string | null;
	count: number;
}

interface CandidateRow {
	atlas_id: string;
	canonical_name: string;
	district: string | null;
	division: string | null;
	sector_category: string | null;
	sector_nature: string | null;
	formality_value: number;
	formality_max: number;
	formality_checkable: number;
	formality_unknown: number;
	formality_version: number;
	formality_evaluation_as_of: string;
}

function cleanFilters(filters: SegmentFilters): SegmentFilters {
	return Object.fromEntries(
		Object.entries(filters)
			.map(([key, value]) => [key, value?.trim()])
			.filter((entry): entry is [string, string] => Boolean(entry[1]))
	) as SegmentFilters;
}

function buildSearchLink(filters: SegmentFilters): string {
	const params = new URLSearchParams();
	for (const key of ['category', 'nature', 'district', 'division', 'present_in'] as const) {
		const value = filters[key];
		if (value) params.set(key, value);
	}
	const query = params.toString();
	return query ? `/search?${query}` : '/search';
}

/** Executes four D1 reads including the live regeneration lookup. */
export async function findSegment(
	db: D1Database,
	inputFilters: SegmentFilters
): Promise<SegmentResponse> {
	const filters = cleanFilters(inputFilters);
	const { whereClause, bindings } = buildSegmentFilter(filters);
	const liveRegenerationId = await getLiveRegenerationId(db);

	const [countRow, divisionsResult, candidatesResult] = await Promise.all([
		db
			.prepare(`SELECT COUNT(*) AS n FROM businesses b${whereClause}`)
			.bind(...bindings)
			.first<{ n: number }>(),
		db
			.prepare(
				`SELECT b.division, COUNT(*) AS count FROM businesses b${whereClause}
				 GROUP BY b.division ORDER BY count DESC, b.division ASC`
			)
			.bind(...bindings)
			.all<DivisionCountRow>(),
		db
			.prepare(
				`SELECT b.atlas_id, b.canonical_name, b.district, b.division,
				 b.sector_category, b.sector_nature,
				 s.value AS formality_value, s.max AS formality_max,
				 s.checkable AS formality_checkable, s.unknown AS formality_unknown,
				 s.version AS formality_version,
				 s.evaluation_as_of AS formality_evaluation_as_of
				 FROM businesses b
				 JOIN scores s ON s.atlas_id = b.atlas_id
				 AND s.regeneration_id = ? AND s.rubric = ?${whereClause}
				 AND s.version = CAST(json_extract(b.scores, '$.formality.version') AS INTEGER)
				 ORDER BY s.value DESC, b.canonical_name ASC, b.atlas_id ASC LIMIT ?`
			)
			.bind(liveRegenerationId, 'formality', ...bindings, 10)
			.all<CandidateRow>()
	]);

	return {
		filters,
		total_count: countRow?.n ?? 0,
		counts_by_division: divisionsResult.results ?? [],
		top_candidates: (candidatesResult.results ?? []).map((row) => ({
			atlas_id: row.atlas_id,
			canonical_name: row.canonical_name,
			district: row.district,
			division: row.division,
			sector_category: row.sector_category,
			sector_nature: row.sector_nature,
			formality: {
				value: row.formality_value,
				max: row.formality_max,
				checkable: row.formality_checkable,
				unknown: row.formality_unknown,
				version: row.formality_version,
				evaluation_as_of: row.formality_evaluation_as_of
			}
		})),
		search_link: buildSearchLink(filters)
	};
}
