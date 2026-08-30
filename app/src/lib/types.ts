// SPDX-License-Identifier: Apache-2.0
/**
 * Shapes shared between the server query module (src/lib/server/atlas.ts), the
 * JSON API routes, the page loaders, and the WebMCP tool result shaping
 * (src/lib/webmcp/tools.ts). Kept free of server-only imports so it can be
 * used from browser code too.
 */

import type { Reference } from './references';

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
	coverage_summary: string;
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
	country: string | null;
	division: string | null;
	district: string | null;
	/** The one line a page or a tool shows for where this business is. */
	location: string;
	sector_category: string | null;
	sector_nature: string | null;
	identifiers: Identifier[];
	formality: FormalitySummary | null;
	coverage: CoverageSummary;
	coverage_summary: string;
}

export interface SearchResponse {
	query: string;
	district: string;
	total_count: number;
	returned: number;
	page_returned: number;
	limit: number;
	offset: number;
	regeneration_id: string | null;
	next_cursor: string | null;
	results: SearchResultItem[];
	/** False when the district filter names a value the data does not carry. */
	district_known?: boolean;
	/** The published values closest to an unknown district, so a caller can offer them. */
	nearest_districts?: string[];
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
	status_note: string | null;
}

export interface ProvenanceRow {
	field: string;
	value: string;
	source: string;
	asserted_at: string;
	precedence: number;
	confidence: string;
	/** Where this value came from, and what a page may link to. See src/lib/references.ts. */
	reference: Reference;
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
	/** The one line a page or a tool shows for where this business is. */
	location: string;
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

export interface EvidenceStatement {
	source: string;
	source_ref: string;
	asserted_at: string;
	precedence: number;
	value: string;
}

export interface JoinedScoreEvidenceItem extends ScoreEvidenceItem {
	statements: EvidenceStatement[];
}

export interface FieldEvidenceResponse {
	atlas_id: string;
	mode: 'field';
	field: string;
	returned: number;
	limit: number;
	next_cursor: string | null;
	statements: EvidenceStatement[];
}

export interface RubricEvidenceResponse {
	atlas_id: string;
	mode: 'rubric';
	rubric: string;
	version: number;
	returned: number;
	limit: number;
	next_cursor: string | null;
	evidence: JoinedScoreEvidenceItem[];
}

export type EvidenceResponse = FieldEvidenceResponse | RubricEvidenceResponse;

export interface ScoreExplanationResponse {
	atlas_id: string;
	rubric: string;
	explanation: string;
}

export interface SegmentFilters {
	category?: string | null;
	nature?: string | null;
	district?: string | null;
	division?: string | null;
	present_in?: string | null;
}

export interface SegmentCandidate {
	atlas_id: string;
	canonical_name: string;
	country: string | null;
	district: string | null;
	division: string | null;
	/** The one line a page or a tool shows for where this business is. */
	location: string;
	sector_category: string | null;
	sector_nature: string | null;
	formality: {
		value: number;
		max: number;
		checkable: number;
		unknown: number;
		version: number;
		evaluation_as_of: string;
	};
}

export interface SegmentResponse {
	filters: SegmentFilters;
	total_count: number;
	counts_by_division: { division: string | null; count: number }[];
	top_candidates: SegmentCandidate[];
	search_link: string;
}

export type ClaimVerificationState =
	| 'unverified'
	| 'website_pending'
	| 'email_pending'
	| 'verified'
	| 'verification_failed'
	| 'revoked';

export type ClaimVerificationMethod = 'website_string' | 'domain_email';

export interface ClaimChallenge {
	challenge_id: string;
	claim_id: string;
	method: ClaimVerificationMethod;
	target: string;
	challenge_value: string | null;
	token_hash: string | null;
	created_at: string;
	expires_at: string;
	consumed_at: string | null;
	attempts: number;
	last_attempt_at: string | null;
	outcome: string | null;
}

export interface ClaimEvidence {
	evidence_id: string;
	claim_id: string;
	r2_key: string;
	content_type: string;
	byte_size: number;
	sha256: string;
	uploaded_at: string;
	uploaded_note: string | null;
}

export interface OperatorStatement {
	operator_statement_id: string;
	claim_id: string;
	atlas_id: string;
	field: string;
	value: string;
	source_ref: string;
	asserted_at: string;
	decision_id: string | null;
	created_at: string;
}

export interface UnconfirmedClaimResponse {
	claim_id: string;
	status: 'unconfirmed';
	confirm_url: string;
	expires_at: string;
	verification_steps: string[];
}

export interface ConfirmedClaimResponse {
	claim_id: string;
	status: 'confirmed';
	verification_steps: string[];
}

export type ClaimResponse = UnconfirmedClaimResponse | ConfirmedClaimResponse;
