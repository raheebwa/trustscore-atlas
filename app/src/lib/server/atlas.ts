/**
 * Query functions shared by the pages and the JSON API (docs/ARCHITECTURE.md
 * section 9 "Serving paths"). Every function takes the D1Database binding as
 * an argument rather than importing `platform.env` directly, so it can be
 * exercised in tests against a fake binding. No user-supplied value is ever
 * interpolated into SQL text; everything goes through `.bind()`.
 */

import {
	clampLimit,
	escapeFtsPhrase,
	likeFallbackPattern,
	normalizeQuery,
	shouldUseFts
} from './search';
import { formatCoverageSentence, formatScoreSentence } from '$lib/format';
import { rankValues } from '$lib/ordering';
import {
	CURSOR_MAX_OFFSET,
	STATEMENTS_BYTE_BUDGET,
	STATEMENTS_MAX_ROWS,
	buildSearchCursor,
	decodeCursor,
	encodeCursor,
	jsonByteLength,
	searchCursorContext,
	statementCursorContext
} from '$lib/pagination';
import type {
	BusinessRecordResponse,
	BusinessScoreSummary,
	CoverageSummary,
	FormalitySummary,
	Identifier,
	ProvenanceRow,
	ScoreEvidenceItem,
	ScoreSummary,
	SearchResponse,
	SearchResultItem,
	SourceSummary,
	StatementRow
} from '$lib/types';

export const LIVE_REGENERATION_KEY = 'live_regeneration';

/**
 * Statement fields that may cross the public serving boundary. An entry ending
 * in `.*` matches only non-empty descendants of that prefix. No other wildcard
 * form is supported.
 */
export const PUBLISHABLE_STATEMENT_FIELDS = [
	'canonical_name',
	'name_variants',
	'entity_kind',
	'sector.source_category',
	'sector.source_nature',
	'location.district',
	'location.division_or_subcounty',
	'location.adm2_pcode',
	'location.adm4_pcode',
	'identifiers',
	'status.*'
] as const;

const CONTACT_FIELD_PATTERN = /(contact|email|phone|address)/i;
const EMAIL_VALUE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_VALUE_PATTERN = /(?:\+\d[\d\s().-]{6,}\d|\b0\d{8,14}\b)/;

/** Precedence labels shown alongside the shared total ordering contract. */
export const PRECEDENCE_RANKS: { rank: number; label: string; explanation: string }[] = [
	{
		rank: 1,
		label: 'Operator verified',
		explanation:
			"The business's own claim, accepted only after verification, outranks every register."
	},
	{
		rank: 2,
		label: 'Register of record',
		explanation:
			'A register that is the legal record of truth (URSB when available; URA for tax identifiers) outranks all but a verified claim.'
	},
	{
		rank: 3,
		label: 'Regulator or authority',
		explanation:
			'A sector regulator or licensing authority (KCCA, BoU, CMA, URBRA, UCC, NLGRB, UNBS, PPDA) outranks derived and inferred values.'
	},
	{
		rank: 4,
		label: 'Derived',
		explanation:
			'A value derived from confirmed record linkage or administrative-boundary tagging, not asserted directly by a register.'
	},
	{
		rank: 5,
		label: 'Inferred',
		explanation:
			'A value inferred by a model or heuristic: the weakest form of evidence, used only when nothing else is available.'
	}
];

interface BusinessRow {
	atlas_id: string;
	country: string;
	canonical_name: string;
	name_normalised: string;
	name_variants: string;
	entity_kind: string;
	sector_category: string | null;
	sector_nature: string | null;
	district: string | null;
	division: string | null;
	first_seen: string;
	last_seen: string;
	coverage: string;
	scores: string;
}

interface IdentifierRow {
	atlas_id: string;
	scheme: string;
	value: string;
	source: string;
}

interface StatementRowDb {
	statement_id: string;
	atlas_id: string;
	country: string;
	field: string;
	value: string;
	source: string;
	source_ref: string;
	source_record_id: string;
	asserted_at: string;
	licence: string;
	precedence: number;
	confidence: string;
}

const STATEMENT_SELECT_COLUMNS =
	's.statement_id, s.atlas_id, s.country, s.field, s.value, s.source, r.source_ref, s.source_record_id, s.asserted_at, s.licence, s.precedence, s.confidence';
const STATEMENT_FROM = 'FROM statements s JOIN refs r ON r.ref_id = s.ref_id';

interface ScoreRowDb {
	atlas_id: string;
	rubric: string;
	version: number;
	regeneration_id: string;
	value: number;
	max: number;
	checkable: number;
	unknown: number;
	coverage: string;
	evidence: string;
	evaluation_as_of: string;
}

interface SourceRowDb {
	slug: string;
	country: string;
	publisher: string;
	title: string;
	url: string;
	licence: string;
	cadence: string;
	coverage: string | null;
	last_run_id: string | null;
	last_run_at: string | null;
	row_count: number | null;
	adapter_version: string | null;
	status: string;
	status_note: string | null;
}

interface RegenerationRow {
	id: string;
	started_at: string;
	finished_at: string;
	inputs: string;
	status: string;
}

function parseCoverage(json: string): CoverageSummary {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) {
			return { applicable: [], checked: [], found_in: [], not_yet_checked: [] };
		}
		const coverage = parsed as Record<string, unknown>;
		return {
			applicable: Array.isArray(coverage.applicable)
				? coverage.applicable.filter((value): value is string => typeof value === 'string')
				: [],
			checked: Array.isArray(coverage.checked)
				? coverage.checked.filter((value): value is string => typeof value === 'string')
				: [],
			found_in: Array.isArray(coverage.found_in)
				? coverage.found_in.filter((value): value is string => typeof value === 'string')
				: [],
			not_yet_checked: Array.isArray(coverage.not_yet_checked)
				? coverage.not_yet_checked.filter((value): value is string => typeof value === 'string')
				: []
		};
	} catch {
		return { applicable: [], checked: [], found_in: [], not_yet_checked: [] };
	}
}

function parseCachedScores(json: string): Record<string, BusinessScoreSummary> {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) return {};
		const scores: Record<string, BusinessScoreSummary> = {};
		for (const [rubric, value] of Object.entries(parsed)) {
			if (typeof value !== 'object' || value === null) continue;
			const score = value as Record<string, unknown>;
			if (
				typeof score.value !== 'number' ||
				typeof score.max !== 'number' ||
				typeof score.checkable !== 'number' ||
				typeof score.unknown !== 'number' ||
				typeof score.version !== 'number'
			) {
				continue;
			}
			scores[rubric] = {
				value: score.value,
				max: score.max,
				checkable: score.checkable,
				unknown: score.unknown,
				version: score.version
			};
		}
		return scores;
	} catch {
		return {};
	}
}

function toIdentifier(row: IdentifierRow): Identifier {
	return { scheme: row.scheme, value: row.value, source: row.source };
}

function toSourceSummary(row: SourceRowDb): SourceSummary {
	return {
		slug: row.slug,
		publisher: row.publisher,
		title: row.title,
		url: row.url,
		licence: row.licence,
		cadence: row.cadence,
		last_run_at: row.last_run_at,
		row_count: row.row_count,
		adapter_version: row.adapter_version,
		status: row.status,
		status_note: row.status_note ?? null
	};
}

function toStatementRow(row: StatementRowDb): StatementRow {
	return {
		statement_id: row.statement_id,
		atlas_id: row.atlas_id,
		country: row.country,
		field: row.field,
		value: row.value,
		source: row.source,
		source_ref: row.source_ref,
		source_record_id: row.source_record_id,
		asserted_at: row.asserted_at,
		licence: row.licence,
		precedence: row.precedence,
		confidence: row.confidence
	};
}

function isPublishableStatementField(field: string): boolean {
	return PUBLISHABLE_STATEMENT_FIELDS.some((allowed) => {
		if (!allowed.endsWith('.*')) return field === allowed;
		const prefix = allowed.slice(0, -1);
		return field.startsWith(prefix) && field.length > prefix.length;
	});
}

function isPublishableStatement(statement: StatementRow): boolean {
	return (
		isPublishableStatementField(statement.field) &&
		!CONTACT_FIELD_PATTERN.test(statement.field) &&
		!EMAIL_VALUE_PATTERN.test(statement.value) &&
		!PHONE_VALUE_PATTERN.test(statement.value)
	);
}

/** Applies the public statement boundary to an in-memory row set. */
export function filterPublishableStatements(statements: readonly StatementRow[]): StatementRow[] {
	return statements.filter(isPublishableStatement);
}

function parseEvidence(json: string): ScoreEvidenceItem[] {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!Array.isArray(parsed)) return [];
		const evidence: ScoreEvidenceItem[] = [];
		for (const item of parsed) {
			if (typeof item !== 'object' || item === null) continue;
			const row = item as Record<string, unknown>;
			if (typeof row.predicate !== 'string' || typeof row.points !== 'number') continue;
			evidence.push({
				predicate: row.predicate,
				points: row.points,
				...(Array.isArray(row.statement_ids) &&
				row.statement_ids.every((id) => typeof id === 'string')
					? { statement_ids: row.statement_ids as string[] }
					: {}),
				...(typeof row.as_of === 'string' ? { as_of: row.as_of } : {}),
				...(typeof row.reason === 'string' ? { reason: row.reason } : {})
			});
		}
		return evidence;
	} catch {
		return [];
	}
}

function parseScoreCoverage(json: string): ScoreSummary['coverage'] {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) {
			return { applicable: 0, checked: 0, found_in: 0, not_yet_checked: 0 };
		}
		const coverage = parsed as Record<string, unknown>;
		return {
			applicable: Number(coverage.applicable) || 0,
			checked: Number(coverage.checked) || 0,
			found_in: Number(coverage.found_in) || 0,
			not_yet_checked: Number(coverage.not_yet_checked) || 0
		};
	} catch {
		return { applicable: 0, checked: 0, found_in: 0, not_yet_checked: 0 };
	}
}

function toScoreSummary(row: ScoreRowDb, statements: StatementRow[] = []): ScoreSummary {
	const evidence = resolveEvidenceFields(parseEvidence(row.evidence), statements);
	const coverage = parseScoreCoverage(row.coverage);
	const unknownPredicates = Array.from(
		new Set(
			evidence
				.filter((item) => item.reason?.toLowerCase().startsWith('not checked'))
				.map((item) => item.predicate)
		)
	);
	const summaryBase = {
		rubric: row.rubric,
		value: row.value,
		checkable: row.checkable,
		unknown: row.unknown,
		unknown_predicates: unknownPredicates
	};
	return {
		rubric: row.rubric,
		version: row.version,
		value: row.value,
		max: row.max,
		checkable: row.checkable,
		unknown: row.unknown,
		coverage,
		coverage_summary: formatCoverageSentence(coverage),
		evidence,
		unknown_predicates: unknownPredicates,
		evaluation_as_of: row.evaluation_as_of,
		summary: formatScoreSentence(summaryBase)
	};
}

function pickWinnerStatement(statements: StatementRow[]): StatementRow | null {
	const [winningValue] = rankValues(statements);
	if (winningValue === undefined) return null;
	return statements
		.filter((statement) => statement.value === winningValue)
		.sort((left, right) => {
			if (left.precedence !== right.precedence) return left.precedence - right.precedence;
			const leftAssertedAt = Date.parse(left.asserted_at);
			const rightAssertedAt = Date.parse(right.asserted_at);
			const leftInstant = Number.isNaN(leftAssertedAt) ? Number.NEGATIVE_INFINITY : leftAssertedAt;
			const rightInstant = Number.isNaN(rightAssertedAt)
				? Number.NEGATIVE_INFINITY
				: rightAssertedAt;
			if (leftInstant !== rightInstant) {
				return rightInstant - leftInstant;
			}
			if (left.source_record_id !== right.source_record_id) {
				return left.source_record_id < right.source_record_id ? -1 : 1;
			}
			if (left.statement_id === right.statement_id) return 0;
			return left.statement_id < right.statement_id ? -1 : 1;
		})[0];
}

export async function getMetaValue(db: D1Database, key: string): Promise<string | null> {
	const row = await db
		.prepare('SELECT value FROM meta WHERE key = ?')
		.bind(key)
		.first<{ value: string }>();
	return row?.value ?? null;
}

export async function getLiveRegenerationId(db: D1Database): Promise<string | null> {
	return getMetaValue(db, LIVE_REGENERATION_KEY);
}

export async function getLiveRegeneration(db: D1Database): Promise<RegenerationRow | null> {
	const id = await getLiveRegenerationId(db);
	if (!id) return null;
	const row = await db
		.prepare('SELECT * FROM regenerations WHERE id = ?')
		.bind(id)
		.first<RegenerationRow>();
	return row ?? null;
}

export async function getSources(db: D1Database): Promise<SourceSummary[]> {
	const { results } = await db
		.prepare('SELECT * FROM sources ORDER BY publisher, title')
		.all<SourceRowDb>();
	return (results ?? []).map(toSourceSummary);
}

export interface HomeStats {
	businessCount: number;
	sourceCount: number;
	liveRegenerationId: string | null;
	liveRegenerationDate: string | null;
	sources: SourceSummary[];
}

export async function getHomeStats(db: D1Database): Promise<HomeStats> {
	const [businessCountRow, sourceCountRow, regeneration, sources] = await Promise.all([
		db.prepare('SELECT COUNT(*) AS n FROM businesses').first<{ n: number }>(),
		db.prepare('SELECT COUNT(*) AS n FROM sources').first<{ n: number }>(),
		getLiveRegeneration(db),
		getSources(db)
	]);
	return {
		businessCount: businessCountRow?.n ?? 0,
		sourceCount: sourceCountRow?.n ?? 0,
		liveRegenerationId: regeneration?.id ?? null,
		liveRegenerationDate: regeneration?.finished_at ?? null,
		sources
	};
}

async function fetchIdentifiersFor(
	db: D1Database,
	atlasIds: string[]
): Promise<Map<string, Identifier[]>> {
	const map = new Map<string, Identifier[]>();
	if (atlasIds.length === 0) return map;
	const { results } = await db
		.prepare(
			'SELECT atlas_id, scheme, value, source FROM identifiers WHERE atlas_id IN (SELECT value FROM json_each(?))'
		)
		.bind(JSON.stringify(atlasIds))
		.all<IdentifierRow>();
	for (const row of results ?? []) {
		const list = map.get(row.atlas_id) ?? [];
		list.push(toIdentifier(row));
		map.set(row.atlas_id, list);
	}
	return map;
}

function toSearchResultItem(
	row: BusinessRow,
	identifiers: Identifier[],
	formality: FormalitySummary | null
): SearchResultItem {
	return {
		atlas_id: row.atlas_id,
		canonical_name: row.canonical_name,
		division: row.division,
		district: row.district,
		sector_category: row.sector_category,
		sector_nature: row.sector_nature,
		identifiers,
		formality
	};
}

async function fetchFormalityFor(
	db: D1Database,
	businesses: BusinessRow[]
): Promise<Map<string, FormalitySummary>> {
	const map = new Map<string, FormalitySummary>();
	const atlasIds = businesses.map((business) => business.atlas_id);
	if (atlasIds.length === 0) return map;
	const expectedVersions = new Map(
		businesses.map((business) => [
			business.atlas_id,
			parseCachedScores(business.scores).formality?.version
		])
	);
	const liveRegenerationId = await getLiveRegenerationId(db);
	if (!liveRegenerationId) return map;
	const { results } = await db
		.prepare(
			`SELECT * FROM scores
			 WHERE regeneration_id = ? AND rubric = ?
			 AND atlas_id IN (SELECT value FROM json_each(?))`
		)
		.bind(liveRegenerationId, 'formality', JSON.stringify(atlasIds))
		.all<ScoreRowDb>();
	for (const row of results ?? []) {
		if (row.version !== expectedVersions.get(row.atlas_id)) continue;
		const score = toScoreSummary(row);
		map.set(row.atlas_id, {
			rubric: score.rubric,
			version: score.version,
			value: score.value,
			max: score.max,
			checkable: score.checkable,
			unknown: score.unknown,
			unknown_predicates: score.unknown_predicates,
			evaluation_as_of: score.evaluation_as_of,
			summary: score.summary,
			coverage_summary: score.coverage_summary
		});
	}
	return map;
}

export interface SearchOptions {
	q: string;
	limit?: number | string | null;
	district?: string | null;
	cursor?: string | null;
}

export async function searchBusinesses(
	db: D1Database,
	options: SearchOptions
): Promise<SearchResponse> {
	const query = normalizeQuery(options.q ?? '');
	const limit = clampLimit(options.limit);
	const normalisedDistrict = options.district ? normalizeQuery(options.district) : '';
	const liveRegenerationId = await getLiveRegenerationId(db);
	const offset = decodeCursor(
		options.cursor,
		'search',
		searchCursorContext(query, normalisedDistrict),
		liveRegenerationId
	);

	if (query.length === 0) {
		return {
			query,
			district: normalisedDistrict,
			total_count: 0,
			returned: 0,
			page_returned: 0,
			limit,
			offset,
			regeneration_id: liveRegenerationId,
			next_cursor: null,
			results: []
		};
	}

	const districtFilter = normalisedDistrict || null;
	const districtClause = districtFilter
		? ' AND (b.district = ? COLLATE NOCASE OR b.division = ? COLLATE NOCASE)'
		: '';
	const districtArgs = districtFilter ? [districtFilter, districtFilter] : [];

	let rows: BusinessRow[];
	let totalCount: number;

	if (shouldUseFts(query)) {
		const phrase = escapeFtsPhrase(query);
		const [countRow, page] = await Promise.all([
			db
				.prepare(
					`SELECT COUNT(*) AS n
					 FROM businesses_fts JOIN businesses AS b ON b.atlas_id = businesses_fts.atlas_id
					 WHERE businesses_fts MATCH ?${districtClause}`
				)
				.bind(phrase, ...districtArgs)
				.first<{ n: number }>(),
			db
				.prepare(
					`SELECT b.*
					 FROM businesses_fts JOIN businesses AS b ON b.atlas_id = businesses_fts.atlas_id
					 WHERE businesses_fts MATCH ?${districtClause}
					 ORDER BY rank, b.atlas_id LIMIT ? OFFSET ?`
				)
				.bind(phrase, ...districtArgs, limit + 1, offset)
				.all<BusinessRow>()
		]);
		totalCount = countRow?.n ?? 0;
		rows = page.results ?? [];
	} else {
		const pattern = likeFallbackPattern(query);
		const [countRow, page] = await Promise.all([
			db
				.prepare(
					`SELECT COUNT(*) AS n FROM businesses AS b
					 WHERE b.name_normalised LIKE ? ESCAPE '\\'${districtClause}`
				)
				.bind(pattern, ...districtArgs)
				.first<{ n: number }>(),
			db
				.prepare(
					`SELECT b.* FROM businesses AS b
					 WHERE b.name_normalised LIKE ? ESCAPE '\\'${districtClause}
					 ORDER BY b.name_normalised, b.atlas_id LIMIT ? OFFSET ?`
				)
				.bind(pattern, ...districtArgs, limit + 1, offset)
				.all<BusinessRow>()
		]);
		totalCount = countRow?.n ?? 0;
		rows = page.results ?? [];
	}

	const hasMore = rows.length > limit;
	const pageRows = rows.slice(0, limit);
	const atlasIds = pageRows.map((row) => row.atlas_id);
	const [identifierMap, formalityMap] = await Promise.all([
		fetchIdentifiersFor(db, atlasIds),
		fetchFormalityFor(db, pageRows)
	]);
	const items = pageRows.map((row) =>
		toSearchResultItem(
			row,
			identifierMap.get(row.atlas_id) ?? [],
			formalityMap.get(row.atlas_id) ?? null
		)
	);

	return {
		query,
		district: normalisedDistrict,
		total_count: totalCount,
		returned: items.length,
		page_returned: items.length,
		limit,
		offset,
		regeneration_id: liveRegenerationId,
		next_cursor:
			hasMore && offset + items.length <= CURSOR_MAX_OFFSET
				? buildSearchCursor(offset + items.length, query, normalisedDistrict, liveRegenerationId)
				: null,
		results: items
	};
}

async function fetchStatementsFor(db: D1Database, atlasId: string): Promise<StatementRow[]> {
	const { results } = await db
		.prepare(
			`SELECT ${STATEMENT_SELECT_COLUMNS} ${STATEMENT_FROM}
			 WHERE atlas_id = ?
			 ORDER BY field, precedence, COALESCE(unixepoch(asserted_at), -9223372036854775808) DESC`
		)
		.bind(atlasId)
		.all<StatementRowDb>();
	return filterPublishableStatements((results ?? []).map(toStatementRow));
}

export function buildProvenanceTable(statements: StatementRow[]): ProvenanceRow[] {
	const byField = new Map<string, StatementRow[]>();
	for (const statement of filterPublishableStatements(statements)) {
		const list = byField.get(statement.field) ?? [];
		list.push(statement);
		byField.set(statement.field, list);
	}
	const rows: ProvenanceRow[] = [];
	for (const [field, list] of byField) {
		const winner = pickWinnerStatement(list);
		if (!winner) continue;
		rows.push({
			field,
			value: winner.value,
			source: winner.source,
			source_ref: winner.source_ref,
			asserted_at: winner.asserted_at,
			precedence: winner.precedence,
			confidence: winner.confidence
		});
	}
	rows.sort((a, b) => a.field.localeCompare(b.field));
	return rows;
}

function resolveEvidenceFields(
	evidence: ScoreEvidenceItem[],
	statements: StatementRow[]
): ScoreEvidenceItem[] {
	const byId = new Map(statements.map((s) => [s.statement_id, s]));
	return evidence.map((item) => {
		const firstId = item.statement_ids?.[0];
		const field = firstId ? byId.get(firstId)?.field : undefined;
		return field ? { ...item, field } : item;
	});
}

async function fetchScoresFor(
	db: D1Database,
	atlasId: string,
	statements: StatementRow[]
): Promise<ScoreSummary[]> {
	const liveRegenerationId = await getLiveRegenerationId(db);
	if (!liveRegenerationId) return [];
	const { results } = await db
		.prepare('SELECT * FROM scores WHERE atlas_id = ? AND regeneration_id = ? ORDER BY rubric')
		.bind(atlasId, liveRegenerationId)
		.all<ScoreRowDb>();
	return (results ?? []).map((row) => toScoreSummary(row, statements));
}

export async function getBusiness(
	db: D1Database,
	atlasId: string
): Promise<BusinessRecordResponse | null> {
	const businessRow = await db
		.prepare('SELECT * FROM businesses WHERE atlas_id = ?')
		.bind(atlasId)
		.first<BusinessRow>();
	if (!businessRow) return null;

	const [identifierMap, statements] = await Promise.all([
		fetchIdentifiersFor(db, [atlasId]),
		fetchStatementsFor(db, atlasId)
	]);
	const scores = await fetchScoresFor(db, atlasId, statements);

	const sourceSlugs = Array.from(new Set(statements.map((s) => s.source)));
	let sources: SourceSummary[] = [];
	if (sourceSlugs.length > 0) {
		const { results } = await db
			.prepare(
				'SELECT * FROM sources WHERE slug IN (SELECT value FROM json_each(?)) ORDER BY publisher, title'
			)
			.bind(JSON.stringify(sourceSlugs))
			.all<SourceRowDb>();
		sources = (results ?? []).map(toSourceSummary);
	}
	const coverage = parseCoverage(businessRow.coverage);

	return {
		atlas_id: businessRow.atlas_id,
		country: businessRow.country,
		canonical_name: businessRow.canonical_name,
		entity_kind: businessRow.entity_kind,
		sector_category: businessRow.sector_category,
		sector_nature: businessRow.sector_nature,
		district: businessRow.district,
		division: businessRow.division,
		first_seen: businessRow.first_seen,
		last_seen: businessRow.last_seen,
		identifiers: identifierMap.get(atlasId) ?? [],
		coverage,
		coverage_summary: formatCoverageSentence(coverage),
		scores,
		sources
	};
}

export interface BusinessDetail {
	record: BusinessRecordResponse;
	provenance: ProvenanceRow[];
	fields: string[];
}

/** Everything the business page needs, in the queries the page load function actually issues. */
export async function getBusinessDetail(
	db: D1Database,
	atlasId: string
): Promise<BusinessDetail | null> {
	const record = await getBusiness(db, atlasId);
	if (!record) return null;
	const statements = await fetchStatementsFor(db, atlasId);
	const provenance = buildProvenanceTable(statements);
	const fields = provenance.map((row) => row.field);
	return { record, provenance, fields };
}

export interface TraceResult {
	field: string;
	returned: number;
	limit: number;
	next_cursor: string | null;
	statements: StatementRow[];
	winnerStatementId: string | null;
}

export async function getFieldTrace(
	db: D1Database,
	atlasId: string,
	field: string,
	options: Omit<StatementsPageOptions, 'field'> = {}
): Promise<TraceResult> {
	const page = await readStatementsPage(db, atlasId, { ...options, field }, 'trace');
	const winner = pickWinnerStatement(page.statements);
	return {
		field,
		returned: page.returned,
		limit: page.limit,
		next_cursor: page.next_cursor,
		statements: page.statements,
		winnerStatementId: winner?.statement_id ?? null
	};
}

export interface StatementsPage {
	atlas_id: string;
	field: string | null;
	returned: number;
	limit: number;
	next_cursor: string | null;
	statements: StatementRow[];
}

interface BuildStatementsPageOptions {
	atlasId: string;
	field: string | null;
	offset: number;
	limit: number;
	hasMore: boolean;
	cursorKind: 'statements' | 'trace';
	cursorContext: string;
	regenerationId: string | null;
	byteBudget?: number;
}

function statementPagePayload(
	statements: StatementRow[],
	options: BuildStatementsPageOptions,
	hasMore: boolean,
	nextOffset: number
): StatementsPage {
	return {
		atlas_id: options.atlasId,
		field: options.field,
		returned: statements.length,
		limit: options.limit,
		next_cursor:
			hasMore && nextOffset <= CURSOR_MAX_OFFSET
				? encodeCursor(
						options.cursorKind,
						nextOffset,
						options.cursorContext,
						options.regenerationId
					)
				: null,
		statements
	};
}

export function buildStatementsPage(
	statements: StatementRow[],
	options: BuildStatementsPageOptions
): StatementsPage {
	const byteBudget = options.byteBudget ?? STATEMENTS_BYTE_BUDGET;
	const candidates = statements.slice(0, options.limit);
	let included: StatementRow[] = [];
	let consumed = 0;
	let sawPublishable = false;

	for (let index = 0; index < candidates.length; index += 1) {
		if (!isPublishableStatement(candidates[index])) {
			consumed = index + 1;
			continue;
		}
		sawPublishable = true;
		const proposed = [...included, candidates[index]];
		const moreAfterProposed = index < candidates.length - 1 || options.hasMore;
		if (
			jsonByteLength(
				statementPagePayload(proposed, options, moreAfterProposed, options.offset + index + 1)
			) > byteBudget
		) {
			break;
		}
		included = proposed;
		consumed = index + 1;
	}

	if (included.length === 0 && sawPublishable) {
		throw new Error('A statement exceeds the response byte budget');
	}

	const hasMore = consumed < candidates.length || options.hasMore;
	return statementPagePayload(included, options, hasMore, options.offset + consumed);
}

export interface StatementsPageOptions {
	field?: string | null;
	limit?: number | string | null;
	cursor?: string | null;
}

async function readStatementsPage(
	db: D1Database,
	atlasId: string,
	options: StatementsPageOptions,
	cursorKind: 'statements' | 'trace'
): Promise<StatementsPage> {
	const field = options.field || null;
	const limit = clampLimit(options.limit, {
		fallback: STATEMENTS_MAX_ROWS,
		max: STATEMENTS_MAX_ROWS
	});
	const liveRegenerationId = await getLiveRegenerationId(db);
	const cursorContext = statementCursorContext(atlasId, field);
	const offset = decodeCursor(options.cursor, cursorKind, cursorContext, liveRegenerationId);
	let rows: StatementRowDb[];
	if (field) {
		const { results } = await db
			.prepare(
				`SELECT ${STATEMENT_SELECT_COLUMNS} ${STATEMENT_FROM}
				 WHERE atlas_id = ? AND field = ?
				 ORDER BY precedence ASC,
				 COALESCE(unixepoch(asserted_at), -9223372036854775808) DESC,
				 statement_id ASC LIMIT ? OFFSET ?`
			)
			.bind(atlasId, field, limit + 1, offset)
			.all<StatementRowDb>();
		rows = results ?? [];
	} else {
		const { results } = await db
			.prepare(
				`SELECT ${STATEMENT_SELECT_COLUMNS} ${STATEMENT_FROM}
				 WHERE atlas_id = ?
				 ORDER BY field, precedence ASC,
				 COALESCE(unixepoch(asserted_at), -9223372036854775808) DESC,
				 statement_id ASC LIMIT ? OFFSET ?`
			)
			.bind(atlasId, limit + 1, offset)
			.all<StatementRowDb>();
		rows = results ?? [];
	}
	return buildStatementsPage(rows.slice(0, limit).map(toStatementRow), {
		atlasId,
		field,
		offset,
		limit,
		hasMore: rows.length > limit,
		cursorKind,
		cursorContext,
		regenerationId: liveRegenerationId
	});
}

/** Reads one bounded statement page directly from D1. */
export async function getStatementsPage(
	db: D1Database,
	atlasId: string,
	options: StatementsPageOptions = {}
): Promise<StatementsPage> {
	return readStatementsPage(db, atlasId, options, 'statements');
}

export async function businessExists(db: D1Database, atlasId: string): Promise<boolean> {
	const row = await db
		.prepare('SELECT 1 AS ok FROM businesses WHERE atlas_id = ?')
		.bind(atlasId)
		.first<{ ok: number }>();
	return row !== null;
}
