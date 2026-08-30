// SPDX-License-Identifier: Apache-2.0
import { describeReference, type Reference } from '$lib/references';
import { summariseIdentifiers } from '$lib/format';
import type {
	BusinessRecordResponse,
	ClaimResponse,
	ConfirmedClaimResponse,
	EvidenceResponse,
	EvidenceStatement,
	ScoreExplanationResponse,
	ScoreSummary,
	SearchResponse,
	SearchResultItem,
	SegmentResponse
} from '$lib/types';
import { CURSOR_MAX_OFFSET, buildSearchCursor } from '$lib/pagination';
import { buildClaimConfirmationText } from '$lib/claims';
import {
	CORRECTABLE_FIELDS,
	FIELD_AUTHORITY_MESSAGE,
	buildCorrectionConfirmationText,
	buildIssueConfirmationText,
	buildLinkageConfirmationText,
	isCorrectableField,
	type CorrectionInput,
	type IssueInput,
	type LinkageLabelInput
} from '$lib/write-requests';

export const MAX_TOOL_RESULT_CHARS = 1500;

export interface ToolTextResult {
	content: { type: 'text'; text: string }[];
}

export interface StartClaimExecutionContext {
	signal?: AbortSignal;
	requestUserInteraction?: <T>(callback: () => T | Promise<T>) => Promise<T>;
}

export interface StartClaimDependencies {
	fetchJson: <T>(
		input: RequestInfo,
		init?: RequestInit
	) => Promise<{ data: T | null; status: number }>;
	confirm: (message: string) => boolean;
	signal?: AbortSignal;
}

export type WriteExecutionContext = StartClaimExecutionContext;
export type WriteExecutionDependencies = StartClaimDependencies;

export const SEARCH_BUSINESSES_TOOL = {
	name: 'search_businesses',
	description:
		'Search TrustScore Atlas for Uganda businesses by name, with optional district paging. Returns locations, sectors, identifiers, and Formality details. Read only.',
	inputSchema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Business name or partial name to search for.'
			},
			district: {
				type: 'string',
				description:
					'District or division, exact and case-insensitive. Use a value from /api/v1/facets; an unknown one returns district_known false plus nearest values.'
			},
			limit: {
				type: 'number',
				description: 'Maximum records in one page, from 1 to 20.',
				minimum: 1,
				maximum: 20
			},
			cursor: {
				type: 'string',
				description: 'Opaque next_cursor from a previous search response.'
			}
		},
		required: ['query']
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

export const GET_BUSINESS_TOOL = {
	name: 'get_business',
	description:
		'Look up one TrustScore Atlas business by atlas_id, including identifiers, sector, location, scores, register coverage, and sources. Read only.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				description: 'Opaque atlas_id of the business record to fetch.'
			}
		},
		required: ['atlas_id']
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

export const GET_EVIDENCE_TOOL = {
	name: 'get_evidence',
	description:
		'Read paged register statements for one business field, or the stored evidence rows and linked statements for one score rubric. Provide exactly one of field or rubric.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the business record.'
			},
			field: {
				type: 'string',
				maxLength: 200,
				description: 'Field whose register statements should be returned.'
			},
			rubric: {
				type: 'string',
				maxLength: 100,
				description: 'Rubric whose score evidence should be returned.'
			},
			cursor: {
				type: 'string',
				description: 'Opaque next_cursor from a previous evidence response.'
			}
		},
		required: ['atlas_id']
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

const RUBRICS = ['formality', 'activity', 'compliance_signals', 'procurement_readiness'] as const;

export const SCORE_BUSINESS_TOOL = {
	name: 'score_business',
	description:
		'Read one stored business score, including value, checkable and unknown mass, unknown predicates, coverage counts, evidence, and evaluation date.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the business record.'
			},
			rubric: { type: 'string', enum: RUBRICS, description: 'Score rubric to read.' },
			version: {
				type: 'number',
				description: 'Optional positive rubric version.',
				minimum: 1
			}
		},
		required: ['atlas_id', 'rubric']
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

export const EXPLAIN_SCORE_TOOL = {
	name: 'explain_score',
	description:
		'Explain one stored score with a fixed sentence for every evidence predicate, followed by the checkable and unknown mass and the score limitation.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the business record.'
			},
			rubric: { type: 'string', enum: RUBRICS, description: 'Score rubric to explain.' }
		},
		required: ['atlas_id', 'rubric']
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

export const FIND_SEGMENT_TOOL = {
	name: 'find_segment',
	description:
		'Find businesses matching optional sector, location, and register-presence filters. Returns division counts, the ten highest Formality candidates, total count, and a filtered search link.',
	inputSchema: {
		type: 'object',
		properties: {
			category: {
				type: 'string',
				maxLength: 200,
				description: 'Exact case-insensitive sector category.'
			},
			nature: {
				type: 'string',
				maxLength: 200,
				description: 'Exact case-insensitive sector nature.'
			},
			district: {
				type: 'string',
				maxLength: 200,
				description: 'Exact case-insensitive district.'
			},
			division: {
				type: 'string',
				maxLength: 200,
				description: 'Exact case-insensitive division or subcounty.'
			},
			present_in: {
				type: 'string',
				maxLength: 200,
				description: 'Register slug required in coverage found_in.'
			}
		}
	},
	annotations: { readOnlyHint: true, untrustedContentHint: true }
} as const;

export const START_CLAIM_TOOL = {
	name: 'start_claim',
	description:
		'Record a request to claim a business. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It does not verify the claim.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the business to claim.'
			},
			claimant_role: {
				type: 'string',
				maxLength: 100,
				description: 'Role of the person requesting the claim.'
			}
		},
		required: ['atlas_id', 'claimant_role']
	},
	annotations: { readOnlyHint: false }
} as const;

export const SUBMIT_CORRECTION_TOOL = {
	name: 'submit_correction',
	description:
		'Record a field correction request with supporting evidence. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. Published records do not change until review.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the business record.'
			},
			field: {
				type: 'string',
				enum: CORRECTABLE_FIELDS,
				description: 'Published field to correct.'
			},
			value: {
				type: 'string',
				maxLength: 2000,
				description: 'Proposed replacement value.'
			},
			evidence_url: {
				type: 'string',
				format: 'uri',
				maxLength: 1000,
				description: 'Public evidence URL supporting the correction.'
			}
		},
		required: ['atlas_id', 'field', 'value', 'evidence_url']
	},
	annotations: { readOnlyHint: false }
} as const;

export const LABEL_LINKAGE_TOOL = {
	name: 'label_linkage',
	description:
		'Record whether an existing linkage candidate pair is a match or non-match. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It never merges records directly.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the first business record.'
			},
			candidate_atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Opaque atlas_id of the candidate business record.'
			},
			verdict: {
				type: 'string',
				enum: ['match', 'non_match'],
				description: 'Whether the candidate pair is a match or non-match.'
			}
		},
		required: ['atlas_id', 'candidate_atlas_id', 'verdict']
	},
	annotations: { readOnlyHint: false }
} as const;

export const REPORT_ISSUE_TOOL = {
	name: 'report_issue',
	description:
		'Record an issue for review, optionally scoped to a business or source. Confirms in the page when supported, otherwise returns a 24-hour page-confirmation URL. It does not change published records.',
	inputSchema: {
		type: 'object',
		properties: {
			atlas_id: {
				type: 'string',
				maxLength: 200,
				description: 'Optional opaque atlas_id related to the issue.'
			},
			source: {
				type: 'string',
				maxLength: 200,
				description: 'Optional register source slug related to the issue.'
			},
			description: {
				type: 'string',
				maxLength: 2000,
				description: 'Clear description of the issue to review.'
			}
		},
		required: ['description']
	},
	annotations: { readOnlyHint: false }
} as const;

function textResult(value: unknown): ToolTextResult {
	return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function shapeToolError(code: string): ToolTextResult {
	return textResult({ error: code });
}

export function shapeHttpToolError(code: string, status: number): ToolTextResult {
	return textResult({ error: code, status });
}

function bounded(value: string, max: number): string {
	return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
}

function fitArrays(payload: Record<string, unknown>, arrays: unknown[][]): ToolTextResult {
	let result = textResult(payload);
	while (result.content[0].text.length > MAX_TOOL_RESULT_CHARS) {
		const target = arrays.find((items) => items.length > 0);
		if (!target) break;
		target.pop();
		if (typeof payload.returned === 'number') payload.returned = arrays[0].length;
		payload.truncated = true;
		result = textResult(payload);
	}
	return result.content[0].text.length <= MAX_TOOL_RESULT_CHARS
		? result
		: textResult({ error: 'result_too_large' });
}

/** A tool result names the register and gives a link only when the register published one. */
function referenceOf(
	row: { source: string; source_ref: string },
	atlasId: string,
	field: string
): Reference {
	return describeReference({
		source: row.source,
		source_ref: row.source_ref,
		atlas_id: atlasId,
		field
	});
}

export function shapeEvidenceResults(response: EvidenceResponse): ToolTextResult {
	if (response.mode === 'field') {
		const grouped = new Map<string, { row: EvidenceStatement; count: number }>();
		for (const row of response.statements) {
			const key = [row.value, row.source, row.asserted_at, row.precedence].join(' ');
			const existing = grouped.get(key);
			if (existing) existing.count += 1;
			else grouped.set(key, { row, count: 1 });
		}
		const statements = [...grouped.values()].map(({ row, count }) => ({
			count,
			source: bounded(row.source, 80),
			source_ref_label: bounded(
				referenceOf(row, response.atlas_id, response.field).source_ref_label,
				180
			),
			source_url: referenceOf(row, response.atlas_id, response.field).source_url,
			asserted_at: bounded(row.asserted_at, 40),
			precedence: row.precedence,
			value: bounded(row.value, 260)
		}));
		const payload: Record<string, unknown> = {
			atlas_id: bounded(response.atlas_id, 100),
			field: bounded(response.field, 100),
			returned: statements.length,
			next_cursor: response.next_cursor,
			statements,
			truncated: false
		};
		return fitArrays(payload, [statements]);
	}

	const evidence = response.evidence.map((item) => ({
		predicate: bounded(item.predicate, 100),
		points: item.points,
		statement_ids: (item.statement_ids ?? []).slice(0, 2).map((id) => bounded(id, 80)),
		...(item.as_of ? { as_of: bounded(item.as_of, 40) } : {}),
		...(item.reason ? { reason: bounded(item.reason, 180) } : {}),
		statements: item.statements.slice(0, 1).map((row) => ({
			source: bounded(row.source, 60),
			source_ref_label: bounded(
				referenceOf(row, response.atlas_id, item.field ?? item.predicate).source_ref_label,
				100
			),
			source_url: referenceOf(row, response.atlas_id, item.field ?? item.predicate).source_url,
			asserted_at: bounded(row.asserted_at, 40),
			precedence: row.precedence,
			value: bounded(row.value, 120)
		}))
	}));
	const payload: Record<string, unknown> = {
		atlas_id: bounded(response.atlas_id, 100),
		rubric: bounded(response.rubric, 100),
		version: response.version,
		returned: evidence.length,
		next_cursor: response.next_cursor,
		evidence,
		truncated: false
	};
	return fitArrays(payload, [evidence]);
}

export function shapeScoreResult(score: ScoreSummary): ToolTextResult {
	const evidence = score.evidence.map((item) => ({
		predicate: bounded(item.predicate, 100),
		points: item.points,
		statement_ids: (item.statement_ids ?? []).slice(0, 3).map((id) => bounded(id, 100)),
		...(item.as_of ? { as_of: bounded(item.as_of, 40) } : {}),
		...(item.reason ? { reason: bounded(item.reason, 180) } : {})
	}));
	const payload: Record<string, unknown> = {
		rubric: score.rubric,
		version: score.version,
		value: score.value,
		max: score.max,
		checkable: score.checkable,
		unknown: score.unknown,
		unknown_predicates: score.unknown_predicates,
		coverage: score.coverage,
		evidence,
		evaluation_as_of: score.evaluation_as_of,
		truncated: false
	};
	return fitArrays(payload, [evidence, payload.unknown_predicates as unknown[]]);
}

export function shapeExplanationResult(response: ScoreExplanationResponse): ToolTextResult {
	const payload = {
		atlas_id: bounded(response.atlas_id, 200),
		rubric: bounded(response.rubric, 100),
		explanation: response.explanation,
		truncated: false
	};
	let result = textResult(payload);
	if (result.content[0].text.length <= MAX_TOOL_RESULT_CHARS) return result;
	payload.explanation = bounded(response.explanation, 1150);
	payload.truncated = true;
	result = textResult(payload);
	return result.content[0].text.length <= MAX_TOOL_RESULT_CHARS
		? result
		: textResult({ error: 'result_too_large' });
}

export function shapeSegmentResult(response: SegmentResponse): ToolTextResult {
	const counts = response.counts_by_division.map(
		(row) => [row.division ? bounded(row.division, 80) : null, row.count] as const
	);
	const candidates = response.top_candidates.map(
		(row) =>
			[bounded(row.atlas_id, 40), bounded(row.canonical_name, 52), row.formality.value] as const
	);
	const payload: Record<string, unknown> = {
		total_count: response.total_count,
		division_count_columns: ['division', 'count'],
		counts_by_division: counts,
		candidate_columns: ['atlas_id', 'canonical_name', 'formality_value'],
		top_candidates: candidates,
		search_link: bounded(response.search_link, 240),
		truncated: false
	};
	return fitArrays(payload, [counts, candidates]);
}

export function shapeClaimResult(response: ClaimResponse): ToolTextResult {
	return textResult(response);
}

export async function executeStartClaim(
	input: { atlas_id: string; claimant_role: string },
	context: StartClaimExecutionContext | undefined,
	dependencies: StartClaimDependencies
): Promise<ToolTextResult> {
	const signal = context?.signal ?? dependencies.signal;
	const createClaim = () =>
		dependencies.fetchJson<ClaimResponse>('/api/v1/claims', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
			signal
		});

	if (typeof context?.requestUserInteraction !== 'function') {
		const claimResult = await createClaim();
		if (!claimResult.data || claimResult.data.status !== 'unconfirmed') {
			return shapeToolError('claim_request_failed');
		}
		return textResult({
			status: 'confirmation_required',
			claim_id: claimResult.data.claim_id,
			confirm_url: claimResult.data.confirm_url,
			expires_at: claimResult.data.expires_at,
			message:
				'Open confirm_url in this browser to confirm the claim request; it expires in 24 hours.'
		});
	}

	const businessResult = await dependencies.fetchJson<BusinessRecordResponse>(
		`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}`,
		{ signal }
	);
	if (!businessResult.data) return shapeToolError('business_not_found');
	const confirmationText = buildClaimConfirmationText({
		atlasId: input.atlas_id,
		canonicalName: businessResult.data.canonical_name,
		claimantRole: input.claimant_role
	});

	let confirmed: boolean;
	try {
		confirmed = await context.requestUserInteraction(async () =>
			dependencies.confirm(confirmationText)
		);
	} catch {
		return shapeToolError('confirmation_failed');
	}
	if (!confirmed) return shapeToolError('claim_cancelled');

	const claimResult = await createClaim();
	if (!claimResult.data || claimResult.data.status !== 'unconfirmed') {
		return shapeToolError('claim_request_failed');
	}
	const token = new URL(
		claimResult.data.confirm_url,
		'https://atlas.example.invalid'
	).searchParams.get('token');
	if (!token) return shapeToolError('claim_confirmation_failed');

	const confirmationResult = await dependencies.fetchJson<ConfirmedClaimResponse>(
		`/api/v1/claims/${encodeURIComponent(claimResult.data.claim_id)}/confirm`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token }),
			signal
		}
	);
	return confirmationResult.data?.status === 'confirmed'
		? textResult({
				status: 'confirmed',
				claim_id: confirmationResult.data.claim_id,
				verification_steps: confirmationResult.data.verification_steps
			})
		: shapeToolError('claim_confirmation_failed');
}

interface PendingWriteResponse {
	status: string;
	confirm_url: string;
	expires_at: string;
	[key: string]: unknown;
}

interface ConfirmedWriteResponse {
	status: string;
	[key: string]: unknown;
}

interface WriteExecutionSpec<TInput extends object> {
	createPath: string;
	idKey: 'correction_id' | 'label_id' | 'issue_id';
	confirmationText: (input: TInput) => string;
}

async function executeWriteRequest<TInput extends object>(
	input: TInput,
	context: WriteExecutionContext | undefined,
	dependencies: WriteExecutionDependencies,
	spec: WriteExecutionSpec<TInput>
): Promise<ToolTextResult> {
	const signal = context?.signal ?? dependencies.signal;
	const createRequest = () =>
		dependencies.fetchJson<PendingWriteResponse>(spec.createPath, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input),
			signal
		});

	if (typeof context?.requestUserInteraction !== 'function') {
		const result = await createRequest();
		const requestId = result.data?.[spec.idKey];
		if (!result.data || result.data.status !== 'unconfirmed' || typeof requestId !== 'string') {
			return shapeToolError('request_failed');
		}
		return textResult({
			status: 'confirmation_required',
			[spec.idKey]: requestId,
			confirm_url: result.data.confirm_url,
			expires_at: result.data.expires_at,
			message: 'Open confirm_url in this browser to confirm the request; it expires in 24 hours.'
		});
	}

	let confirmed: boolean;
	try {
		confirmed = await context.requestUserInteraction(async () =>
			dependencies.confirm(spec.confirmationText(input))
		);
	} catch {
		return shapeToolError('confirmation_failed');
	}
	if (!confirmed) return shapeToolError('request_cancelled');

	const created = await createRequest();
	const requestId = created.data?.[spec.idKey];
	if (!created.data || created.data.status !== 'unconfirmed' || typeof requestId !== 'string') {
		return shapeToolError('request_failed');
	}
	const token = new URL(created.data.confirm_url, 'https://atlas.example.invalid').searchParams.get(
		'token'
	);
	if (!token) return shapeToolError('confirmation_failed');

	const confirmation = await dependencies.fetchJson<ConfirmedWriteResponse>(
		`${spec.createPath}/${encodeURIComponent(requestId)}/confirm`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token }),
			signal
		}
	);
	return confirmation.data?.status === 'confirmed'
		? textResult({ status: 'confirmed', [spec.idKey]: requestId })
		: shapeToolError('confirmation_failed');
}

export async function executeSubmitCorrection(
	input: CorrectionInput,
	context: WriteExecutionContext | undefined,
	dependencies: WriteExecutionDependencies
): Promise<ToolTextResult> {
	if (!isCorrectableField(input.field)) {
		return textResult({
			error: 'field_not_correctable',
			message: FIELD_AUTHORITY_MESSAGE
		});
	}
	return executeWriteRequest(input, context, dependencies, {
		createPath: '/api/v1/corrections',
		idKey: 'correction_id',
		confirmationText: buildCorrectionConfirmationText
	});
}

export async function executeLabelLinkage(
	input: LinkageLabelInput,
	context: WriteExecutionContext | undefined,
	dependencies: WriteExecutionDependencies
): Promise<ToolTextResult> {
	return executeWriteRequest(input, context, dependencies, {
		createPath: '/api/v1/linkage-labels',
		idKey: 'label_id',
		confirmationText: buildLinkageConfirmationText
	});
}

export async function executeReportIssue(
	input: IssueInput,
	context: WriteExecutionContext | undefined,
	dependencies: WriteExecutionDependencies
): Promise<ToolTextResult> {
	return executeWriteRequest(input, context, dependencies, {
		createPath: '/api/v1/issues',
		idKey: 'issue_id',
		confirmationText: buildIssueConfirmationText
	});
}

/**
 * One search hit for a model: the register lists that are derivable from the pack stay out
 * (the coverage sentence carries their counts), found_in stays in because it is the linkage
 * evidence. A hit that still does not fit the budget alone is reduced to its identity line.
 */
function shapeSearchHit(item: SearchResultItem, minimal = false) {
	const identity = {
		atlas_id: item.atlas_id,
		canonical_name: item.canonical_name,
		district: item.district,
		division: item.division,
		location: item.location,
		sector_category: item.sector_category,
		sector_nature: item.sector_nature,
		coverage: { found_in: item.coverage.found_in, summary: item.coverage_summary }
	};
	if (minimal) return identity;
	return {
		...identity,
		identifiers: summariseIdentifiers(item.identifiers),
		scores: item.formality ? [item.formality] : []
	};
}

export function shapeSearchResults(response: SearchResponse): ToolTextResult {
	const mappedResults = response.results.map((item) => shapeSearchHit(item));

	for (let count = mappedResults.length; count >= 1; count -= 1) {
		const resumesInsidePage = count < mappedResults.length;
		const continuationOffset = response.offset + count;
		const nextCursor = resumesInsidePage
			? count > 0 && continuationOffset <= CURSOR_MAX_OFFSET
				? buildSearchCursor(
						continuationOffset,
						response.query,
						response.district,
						response.regeneration_id
					)
				: null
			: response.next_cursor;
		const payload = {
			query: response.query,
			...(response.district_known === false
				? {
						district_known: false,
						nearest_districts: (response.nearest_districts ?? []).slice(0, 3)
					}
				: {}),
			total_count: response.total_count,
			returned: count,
			page_returned: response.page_returned,
			next_cursor: nextCursor,
			results: mappedResults.slice(0, count),
			truncated: count < mappedResults.length
		};
		const result = textResult(payload);
		if (result.content[0].text.length <= MAX_TOOL_RESULT_CHARS) return result;
	}

	if (response.results.length > 0) {
		const minimal = textResult({
			query: response.query,
			total_count: response.total_count,
			returned: 1,
			page_returned: response.page_returned,
			next_cursor:
				response.results.length > 1 && response.offset + 1 <= CURSOR_MAX_OFFSET
					? buildSearchCursor(
							response.offset + 1,
							response.query,
							response.district,
							response.regeneration_id
						)
					: response.next_cursor,
			results: [shapeSearchHit(response.results[0], true)],
			truncated: true
		});
		if (minimal.content[0].text.length <= MAX_TOOL_RESULT_CHARS) return minimal;
	}

	return textResult({
		query: response.query,
		total_count: response.total_count,
		returned: 0,
		next_cursor: response.next_cursor,
		results: [],
		// An empty answer has to say why: a filter naming a value the data does not carry is a
		// different thing from a name nobody registered, and a model cannot tell them apart.
		...(response.district_known === false
			? {
					district_known: false,
					nearest_districts: (response.nearest_districts ?? []).slice(0, 3)
				}
			: {}),
		truncated: response.results.length > 0
	});
}

export function shapeBusinessRecord(record: BusinessRecordResponse): ToolTextResult {
	const payload = {
		atlas_id: record.atlas_id,
		country: record.country,
		canonical_name: record.canonical_name,
		entity_kind: record.entity_kind,
		district: record.district,
		division: record.division,
		location: record.location,
		sector_category: record.sector_category,
		sector_nature: record.sector_nature,
		identifiers: summariseIdentifiers(record.identifiers),
		coverage: {
			applicable: [...record.coverage.applicable],
			checked: [...record.coverage.checked],
			found_in: [...record.coverage.found_in],
			not_yet_checked: [...record.coverage.not_yet_checked],
			summary: record.coverage_summary
		},
		scores: record.scores.map((score) => ({
			rubric: score.rubric,
			version: score.version,
			value: score.value,
			max: score.max,
			checkable: score.checkable,
			unknown: score.unknown,
			coverage: score.coverage,
			coverage_summary: score.coverage_summary,
			unknown_predicates: score.unknown_predicates,
			evaluation_as_of: score.evaluation_as_of,
			summary: score.summary
		})),
		sources: record.sources.map((source) => ({
			slug: source.slug,
			title: source.title,
			last_run_at: source.last_run_at
		})),
		truncated: false
	};

	// Cut the derivable lists first (the coverage summary sentence already carries their
	// counts) and identifiers last: they are the record's identity and the smallest payload.
	const removableArrays: unknown[][] = [
		payload.coverage.applicable,
		payload.coverage.not_yet_checked,
		payload.coverage.checked,
		payload.coverage.found_in,
		payload.sources,
		payload.scores,
		payload.identifiers
	];
	let result = textResult(payload);
	while (result.content[0].text.length > MAX_TOOL_RESULT_CHARS) {
		const target = removableArrays.find((items) => items.length > 0);
		if (!target) break;
		target.pop();
		payload.truncated = true;
		result = textResult(payload);
	}

	if (result.content[0].text.length <= MAX_TOOL_RESULT_CHARS) return result;
	return textResult({
		atlas_id: record.atlas_id.slice(0, 256),
		coverage: { summary: record.coverage_summary },
		scores: [],
		truncated: true
	});
}
