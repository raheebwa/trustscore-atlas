/**
 * Shapes shared between the server query module (src/lib/server/atlas.ts), the
 * JSON API routes, the page loaders, and the WebMCP tool result shaping
 * (src/lib/webmcp/tools.ts). Kept free of server-only imports so it can be
 * used from browser code too.
 */

export interface Identifier {
	scheme: string;
	value: string;
	source: string;
}

export interface FormalitySummary {
	rubric: string;
	version: number;
	value: number;
	max: number;
	checkable: number;
	unknown: number;
	unknown_predicates: string[];
	evaluation_as_of: string;
	summary: string;
}

export interface BusinessScoreSummary {
	value: number;
	max: number;
	checkable: number;
	unknown: number;
	version: number;
}

export interface SearchResultItem {
	atlas_id: string;
	canonical_name: string;
	division: string | null;
	district: string | null;
	sector_category: string | null;
	sector_nature: string | null;
	identifiers: Identifier[];
	formality: FormalitySummary | null;
}

export interface SearchResponse {
	query: string;
	total_count: number;
	returned: number;
	limit: number;
	next_cursor: string | null;
	results: SearchResultItem[];
}

export interface CoverageSummary {
	applicable: string[];
	checked: string[];
	found_in: string[];
	not_yet_checked: string[];
}

export interface ScoreEvidenceItem {
	predicate: string;
	points: number;
	statement_ids?: string[];
	as_of?: string;
	reason?: string;
	/** Field of the first linked statement, resolved server-side for trace links. */
	field?: string;
}

export interface ScoreSummary {
	rubric: string;
	version: number;
	value: number;
	max: number;
	checkable: number;
	unknown: number;
	coverage: { applicable: number; checked: number; found_in: number; not_yet_checked: number };
	coverage_summary: string;
	evidence: ScoreEvidenceItem[];
	unknown_predicates: string[];
	evaluation_as_of: string;
	summary: string;
}

export interface SourceSummary {
	slug: string;
	publisher: string;
	title: string;
	url: string;
	licence: string;
	cadence: string;
	last_run_at: string | null;
	row_count: number | null;
	adapter_version: string | null;
	status: string;
}

export interface ProvenanceRow {
	field: string;
	value: string;
	source: string;
	source_ref: string;
	asserted_at: string;
	precedence: number;
	confidence: string;
}

export interface BusinessRecordResponse {
	atlas_id: string;
	country: string;
	canonical_name: string;
	entity_kind: string;
	sector_category: string | null;
	sector_nature: string | null;
	district: string | null;
	division: string | null;
	first_seen: string;
	last_seen: string;
	identifiers: Identifier[];
	coverage: CoverageSummary;
	coverage_summary: string;
	scores: ScoreSummary[];
	sources: SourceSummary[];
}

export interface StatementRow {
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
