import { getConsistentLiveRegenerationId } from './atlas';
import type { AtlasDatabases } from './platform';
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

interface CandidateBusinessRow {
	atlas_id: string;
	canonical_name: string;
	country: string | null;
	district: string | null;
	division: string | null;
	sector_category: string | null;
	sector_nature: string | null;
	scores: string;
}

interface SegmentScoreRow {
	atlas_id: string;
	value: number;
	max: number;
	checkable: number;
	unknown: number;
	version: number;
	evaluation_as_of: string;
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

function cachedFormalityVersion(json: string): number | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const formality = (parsed as Record<string, unknown>).formality;
		if (typeof formality !== 'object' || formality === null) return null;
		const version = (formality as Record<string, unknown>).version;
		return typeof version === 'number' && Number.isSafeInteger(version) ? version : null;
	} catch {
		return null;
	}
}

async function topSegmentCandidates(
	scoresDb: D1Database,
	liveRegenerationId: string | null,
	businesses: CandidateBusinessRow[]
): Promise<SegmentResponse['top_candidates']> {
	if (!liveRegenerationId || businesses.length === 0) return [];
	const expectedVersions = new Map(
		businesses.map((business) => [business.atlas_id, cachedFormalityVersion(business.scores)])
	);
	const atlasIds = businesses
		.filter((business) => expectedVersions.get(business.atlas_id) !== null)
		.map((business) => business.atlas_id);
	if (atlasIds.length === 0) return [];
	const { results } = await scoresDb
		.prepare(
			`SELECT atlas_id, value, max, checkable, unknown, version, evaluation_as_of
			 FROM scores WHERE regeneration_id = ? AND rubric = ?
			 AND atlas_id IN (SELECT value FROM json_each(?))`
		)
		.bind(liveRegenerationId, 'formality', JSON.stringify(atlasIds))
		.all<SegmentScoreRow>();
	const businessesById = new Map(businesses.map((business) => [business.atlas_id, business]));
	return (results ?? [])
		.filter((score) => score.version === expectedVersions.get(score.atlas_id))
		.map((score) => ({ score, business: businessesById.get(score.atlas_id) }))
		.filter(
			(entry): entry is { score: SegmentScoreRow; business: CandidateBusinessRow } =>
				entry.business !== undefined
		)
		.sort((left, right) => {
			if (left.score.value !== right.score.value) return right.score.value - left.score.value;
			const byName = left.business.canonical_name.localeCompare(right.business.canonical_name);
			return byName || left.business.atlas_id.localeCompare(right.business.atlas_id);
		})
		.slice(0, 10)
		.map(({ business, score }) => ({
			atlas_id: business.atlas_id,
			canonical_name: business.canonical_name,
			country: business.country,
			district: business.district,
			division: business.division,
			sector_category: business.sector_category,
			sector_nature: business.sector_nature,
			formality: {
				value: score.value,
				max: score.max,
				checkable: score.checkable,
				unknown: score.unknown,
				version: score.version,
				evaluation_as_of: score.evaluation_as_of
			}
		}));
}

export async function findSegment(
	databases: AtlasDatabases,
	inputFilters: SegmentFilters
): Promise<SegmentResponse> {
	const { db, scoresDb } = databases;
	const filters = cleanFilters(inputFilters);
	const { whereClause, bindings } = buildSegmentFilter(filters);
	const liveRegenerationId = await getConsistentLiveRegenerationId(databases);

	const [countRow, divisionsResult, businessesResult] = await Promise.all([
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
				`SELECT b.atlas_id, b.canonical_name, b.country, b.district, b.division,
				 b.sector_category, b.sector_nature, b.scores
				 FROM businesses b${whereClause}
				 ORDER BY CAST(json_extract(b.scores, '$.formality.value') AS INTEGER) DESC,
				 b.canonical_name ASC, b.atlas_id ASC LIMIT ?`
			)
			.bind(...bindings, 10)
			.all<CandidateBusinessRow>()
	]);
	const topCandidates = await topSegmentCandidates(
		scoresDb,
		liveRegenerationId,
		businessesResult.results ?? []
	);

	return {
		filters,
		total_count: countRow?.n ?? 0,
		counts_by_division: divisionsResult.results ?? [],
		top_candidates: topCandidates,
		search_link: buildSearchLink(filters)
	};
}
