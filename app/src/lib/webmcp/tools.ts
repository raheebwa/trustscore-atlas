import type { BusinessRecordResponse, SearchResponse } from '$lib/types';

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

function textResult(value: unknown): ToolTextResult {
	return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function shapeToolError(code: string): ToolTextResult {
	return textResult({ error: code });
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
		const payload = {
			query: response.query,
			total_count: response.total_count,
			returned: count,
			page_returned: response.returned,
			next_cursor: response.next_cursor,
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
