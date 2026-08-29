import type {
	BusinessRecordResponse,
	ClaimResponse,
	EvidenceResponse,
	ScoreExplanationResponse,
	ScoreSummary,
	SearchResponse,
	SegmentResponse
} from '$lib/types';
import { CURSOR_MAX_OFFSET, buildSearchCursor } from '$lib/pagination';

export const MAX_TOOL_RESULT_CHARS = 1500;

export interface ToolTextResult {
	content: { type: 'text'; text: string }[];
}

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
				description: 'Optional district or division name for an exact case-insensitive match.'
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
		'After explicit browser confirmation, record a request to claim a business. This stores only a requested claim and returns the verification routes. It does not verify the claim.',
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

export function shapeEvidenceResults(response: EvidenceResponse): ToolTextResult {
	if (response.mode === 'field') {
		const statements = response.statements.map((row) => ({
			source: bounded(row.source, 80),
			source_ref: bounded(row.source_ref, 180),
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
			source_ref: bounded(row.source_ref, 100),
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

export function shapeSearchResults(response: SearchResponse): ToolTextResult {
	const mappedResults = response.results.map((item) => ({
		atlas_id: item.atlas_id,
		canonical_name: item.canonical_name,
		district: item.district,
		division: item.division,
		sector_category: item.sector_category,
		sector_nature: item.sector_nature,
		identifiers: item.identifiers,
		scores: item.formality ? [item.formality] : []
	}));

	for (let count = mappedResults.length; count >= 0; count -= 1) {
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

	return textResult({
		total_count: response.total_count,
		returned: 0,
		next_cursor: response.next_cursor,
		results: [],
		truncated: true
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
		sector_category: record.sector_category,
		sector_nature: record.sector_nature,
		identifiers: [...record.identifiers],
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
