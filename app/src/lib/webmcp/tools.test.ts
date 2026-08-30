// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
	EXPLAIN_SCORE_TOOL,
	FIND_SEGMENT_TOOL,
	GET_EVIDENCE_TOOL,
	GET_BUSINESS_TOOL,
	LABEL_LINKAGE_TOOL,
	MAX_TOOL_RESULT_CHARS,
	REPORT_ISSUE_TOOL,
	SCORE_BUSINESS_TOOL,
	SEARCH_BUSINESSES_TOOL,
	START_CLAIM_TOOL,
	SUBMIT_CORRECTION_TOOL,
	executeLabelLinkage,
	executeReportIssue,
	executeStartClaim,
	executeSubmitCorrection,
	shapeBusinessRecord,
	shapeEvidenceResults,
	shapeExplanationResult,
	shapeScoreResult,
	shapeSearchResults,
	shapeSegmentResult,
	shapeToolError,
	type ToolTextResult
} from './tools';
import type { BusinessRecordResponse, SearchResponse, SearchResultItem } from '$lib/types';
import { buildSearchCursor, decodeCursor, searchCursorContext } from '$lib/pagination';

const scoreSummary =
	'Formality 25 of 55 checkable; 45 unknown (not yet checked: ura.vat_withholding_agents, ppda.ocds)';

function makeResult(index: number): SearchResultItem {
	return {
		atlas_id: `atlas-${index}`,
		canonical_name: `Example Hardware Supplies ${index} Ltd`,
		country: 'UG',
		division: 'Nakawa',
		district: 'Kampala',
		location: 'Nakawa, Kampala',
		sector_category: 'Trade',
		sector_nature: 'Hardware',
		identifiers: [{ scheme: 'ug:kcca_licence', value: `KCCA-${index}`, source: 'kcca.businesses' }],
		coverage: {
			applicable: ['kcca.businesses', 'example.pending'],
			checked: ['kcca.businesses'],
			found_in: ['kcca.businesses'],
			not_yet_checked: ['example.pending']
		},
		coverage_summary: 'found in 1 of 1 checked; 1 not yet checked',
		formality: {
			rubric: 'formality',
			version: 1,
			value: 25,
			max: 100,
			checkable: 55,
			unknown: 45,
			unknown_predicates: ['ura.vat_withholding_agents', 'ppda.ocds'],
			evaluation_as_of: '2026-08-29T09:05:00Z',
			summary: scoreSummary,
			coverage_summary: 'found in 1 of 1 checked; 2 not yet checked'
		}
	};
}

const businessFixture: BusinessRecordResponse = {
	atlas_id: 'atlas-1',
	country: 'UG',
	canonical_name: 'Example Hardware Supplies Ltd',
	entity_kind: 'company',
	sector_category: 'Trade',
	sector_nature: 'Hardware',
	district: 'Kampala',
	division: 'Nakawa',
	location: 'Nakawa, Kampala',
	first_seen: '2026-08-01',
	last_seen: '2026-08-12',
	identifiers: [{ scheme: 'ug:kcca_licence', value: 'KCCA-1', source: 'kcca.businesses' }],
	coverage: {
		applicable: ['kcca.businesses', 'ura.vat_withholding_agents', 'ppda.ocds'],
		checked: ['kcca.businesses'],
		found_in: ['kcca.businesses'],
		not_yet_checked: ['ura.vat_withholding_agents', 'ppda.ocds']
	},
	coverage_summary: 'found in 1 of 1 checked; 2 not yet checked',
	scores: [
		{
			rubric: 'formality',
			version: 1,
			value: 25,
			max: 100,
			checkable: 55,
			unknown: 45,
			coverage: { applicable: 3, checked: 1, found_in: 1, not_yet_checked: 2 },
			coverage_summary: 'found in 1 of 1 checked; 2 not yet checked',
			evidence: [
				{ predicate: 'kcca.businesses', points: 25, statement_ids: ['s1'] },
				{
					predicate: 'ura.vat_withholding_agents',
					points: 0,
					reason: 'not checked (register unavailable)'
				}
			],
			unknown_predicates: ['ura.vat_withholding_agents', 'ppda.ocds'],
			evaluation_as_of: '2026-08-29T09:05:00Z',
			summary: scoreSummary
		}
	],
	sources: [
		{
			slug: 'kcca.businesses',
			publisher: 'KCCA',
			title: 'KCCA Business Licences',
			url: 'https://example.org/kcca',
			licence: 'CC-BY-4.0',
			cadence: 'monthly',
			last_run_at: '2026-08-01',
			row_count: 100,
			adapter_version: '1.0.0',
			status: 'fresh',
			status_note: null
		}
	]
};

function parsed(result: ToolTextResult): Record<string, unknown> {
	expect(result.content).toHaveLength(1);
	expect(result.content[0].type).toBe('text');
	expect(result.content[0].text).not.toContain('\n');
	return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('definitions', () => {
	for (const definition of [
		SEARCH_BUSINESSES_TOOL,
		GET_BUSINESS_TOOL,
		GET_EVIDENCE_TOOL,
		SCORE_BUSINESS_TOOL,
		EXPLAIN_SCORE_TOOL,
		FIND_SEGMENT_TOOL
	]) {
		it(`${definition.name}: has bounded descriptions and safe annotations`, () => {
			expect(definition.description.length).toBeLessThan(500);
			for (const property of Object.values(definition.inputSchema.properties)) {
				expect(property.description.length).toBeLessThan(150);
			}
			expect(definition.annotations).toEqual({
				readOnlyHint: true,
				untrustedContentHint: true
			});
		});
	}

	it('start_claim: is a bounded write definition', () => {
		expect(START_CLAIM_TOOL.name).toBe('start_claim');
		expect(START_CLAIM_TOOL.description.length).toBeLessThan(500);
		for (const property of Object.values(START_CLAIM_TOOL.inputSchema.properties)) {
			expect(property.description.length).toBeLessThan(150);
		}
		expect(START_CLAIM_TOOL.annotations).toEqual({ readOnlyHint: false });
	});

	for (const definition of [SUBMIT_CORRECTION_TOOL, LABEL_LINKAGE_TOOL, REPORT_ISSUE_TOOL]) {
		it(`${definition.name}: is a bounded write definition`, () => {
			expect(definition.description.length).toBeLessThan(500);
			for (const property of Object.values(definition.inputSchema.properties)) {
				expect(property.description.length).toBeLessThan(150);
			}
			expect(definition.annotations).toEqual({ readOnlyHint: false });
		});
	}

	it('exports the ten expected page tool names', () => {
		expect([
			SEARCH_BUSINESSES_TOOL.name,
			GET_BUSINESS_TOOL.name,
			GET_EVIDENCE_TOOL.name,
			SCORE_BUSINESS_TOOL.name,
			EXPLAIN_SCORE_TOOL.name,
			FIND_SEGMENT_TOOL.name,
			START_CLAIM_TOOL.name,
			SUBMIT_CORRECTION_TOOL.name,
			LABEL_LINKAGE_TOOL.name,
			REPORT_ISSUE_TOOL.name
		]).toEqual([
			'search_businesses',
			'get_business',
			'get_evidence',
			'score_business',
			'explain_score',
			'find_segment',
			'start_claim',
			'submit_correction',
			'label_linkage',
			'report_issue'
		]);
	});
});

describe('additional write execution', () => {
	it('returns a confirmation URL without storing a confirmed correction', async () => {
		const calls: string[] = [];
		const result = await executeSubmitCorrection(
			{
				atlas_id: 'atlas-example-1',
				field: 'canonical_name',
				value: 'Example Workshop Limited',
				evidence_url: 'https://example.org/evidence/example-workshop'
			},
			undefined,
			{
				fetchJson: async <T>(input: RequestInfo) => {
					calls.push(String(input));
					return {
						data: {
							correction_id: 'correction_example_1',
							status: 'unconfirmed',
							confirm_url: '/correct/correction_example_1?token=plain-example-token',
							expires_at: '2026-08-31T12:00:00.000Z'
						} as T,
						status: 201
					};
				},
				confirm: () => true
			}
		);

		expect(parsed(result)).toEqual({
			status: 'confirmation_required',
			correction_id: 'correction_example_1',
			confirm_url: '/correct/correction_example_1?token=plain-example-token',
			expires_at: '2026-08-31T12:00:00.000Z',
			message: 'Open confirm_url in this browser to confirm the request; it expires in 24 hours.'
		});
		expect(calls).toEqual(['/api/v1/corrections']);
	});

	it('refuses fields outside correction authority before making a request', async () => {
		let called = false;
		const result = await executeSubmitCorrection(
			{
				atlas_id: 'atlas-example-1',
				field: 'identifiers',
				value: 'example-value',
				evidence_url: 'https://example.org/evidence/example-identifier'
			},
			undefined,
			{
				fetchJson: async () => {
					called = true;
					return { data: null, status: 500 };
				},
				confirm: () => true
			}
		);

		expect(parsed(result)).toEqual({
			error: 'field_not_correctable',
			message:
				'Identifiers, register statuses and licence standing can only be disputed through report_issue.'
		});
		expect(called).toBe(false);
	});

	it('confirms a linkage label in place after showing the exact pair', async () => {
		const calls: { input: string; init?: RequestInit }[] = [];
		let confirmationText = '';
		const result = await executeLabelLinkage(
			{
				atlas_id: 'atlas-example-1',
				candidate_atlas_id: 'atlas-example-2',
				verdict: 'non_match'
			},
			{
				requestUserInteraction: async <T>(callback: () => T | Promise<T>) => callback()
			},
			{
				fetchJson: async <T>(input: RequestInfo, init?: RequestInit) => {
					const url = String(input);
					calls.push({ input: url, init });
					return url.endsWith('/confirm')
						? ({
								data: { label_id: 'label_example_1', status: 'confirmed' } as T,
								status: 200
							} as const)
						: ({
								data: {
									label_id: 'label_example_1',
									status: 'unconfirmed',
									confirm_url: '/label/label_example_1?token=plain-example-token',
									expires_at: '2026-08-31T12:00:00.000Z'
								} as T,
								status: 201
							} as const);
				},
				confirm: (message) => {
					confirmationText = message;
					return true;
				}
			}
		);

		expect(parsed(result)).toEqual({
			status: 'confirmed',
			label_id: 'label_example_1'
		});
		expect(confirmationText).toContain('atlas_id: atlas-example-1');
		expect(confirmationText).toContain('candidate atlas_id: atlas-example-2');
		expect(confirmationText).toContain('verdict: non_match');
		expect(calls.map((call) => call.input)).toEqual([
			'/api/v1/linkage-labels',
			'/api/v1/linkage-labels/label_example_1/confirm'
		]);
		expect(JSON.parse(String(calls[1].init?.body))).toEqual({ token: 'plain-example-token' });
	});

	it('does not create an issue when the visitor cancels the exact prompt', async () => {
		let called = false;
		let confirmationText = '';
		const result = await executeReportIssue(
			{
				source: 'example.register',
				description: 'The example source date appears incomplete.'
			},
			{
				requestUserInteraction: async <T>(callback: () => T | Promise<T>) => callback()
			},
			{
				fetchJson: async () => {
					called = true;
					return { data: null, status: 500 };
				},
				confirm: (message) => {
					confirmationText = message;
					return false;
				}
			}
		);

		expect(parsed(result)).toEqual({ error: 'request_cancelled' });
		expect(confirmationText).toContain('source: example.register');
		expect(confirmationText).toContain('description: The example source date appears incomplete.');
		expect(called).toBe(false);
	});
});

describe('start_claim execution', () => {
	it('returns the page-confirmation result when in-page confirmation is unavailable', async () => {
		const calls: { input: string; init?: RequestInit }[] = [];
		const modelContext = {};
		const result = await executeStartClaim(
			{ atlas_id: 'atlas-example-1', claimant_role: 'authorised representative' },
			modelContext,
			{
				fetchJson: async <T>(input: RequestInfo, init?: RequestInit) => {
					calls.push({ input: String(input), init });
					return {
						data: {
							claim_id: 'claim_example_1',
							status: 'unconfirmed',
							confirm_url: '/claim/claim_example_1?token=plain-example-token',
							expires_at: '2026-08-31T12:00:00.000Z',
							verification_steps: []
						} as T,
						status: 201
					};
				},
				confirm: () => true
			}
		);

		expect(parsed(result)).toEqual({
			status: 'confirmation_required',
			claim_id: 'claim_example_1',
			confirm_url: '/claim/claim_example_1?token=plain-example-token',
			expires_at: '2026-08-31T12:00:00.000Z',
			message:
				'Open confirm_url in this browser to confirm the claim request; it expires in 24 hours.'
		});
		expect(calls.map((call) => call.input)).toEqual(['/api/v1/claims']);
	});

	it('creates and immediately confirms after in-page confirmation', async () => {
		const calls: { input: string; init?: RequestInit }[] = [];
		let confirmationText = '';
		const modelContext = {
			async requestUserInteraction<T>(callback: () => T | Promise<T>): Promise<T> {
				return callback();
			}
		};
		const result = await executeStartClaim(
			{ atlas_id: 'atlas-example-1', claimant_role: 'owner or director' },
			modelContext,
			{
				fetchJson: async <T>(input: RequestInfo, init?: RequestInit) => {
					const url = String(input);
					calls.push({ input: url, init });
					if (url.includes('/businesses/')) return { data: businessFixture as T, status: 200 };
					if (url.endsWith('/confirm')) {
						return {
							data: {
								claim_id: 'claim_example_2',
								status: 'confirmed',
								verification_steps: ['Example verification route.']
							} as T,
							status: 200
						};
					}
					return {
						data: {
							claim_id: 'claim_example_2',
							status: 'unconfirmed',
							confirm_url: '/claim/claim_example_2?token=plain-example-token',
							expires_at: '2026-08-31T12:00:00.000Z',
							verification_steps: ['Example verification route.']
						} as T,
						status: 201
					};
				},
				confirm: (message) => {
					confirmationText = message;
					return true;
				}
			}
		);

		expect(parsed(result)).toEqual({
			status: 'confirmed',
			claim_id: 'claim_example_2',
			verification_steps: ['Example verification route.']
		});
		expect(confirmationText).toContain('Example Hardware Supplies Ltd');
		expect(calls.map((call) => call.input)).toEqual([
			'/api/v1/businesses/atlas-example-1',
			'/api/v1/claims',
			'/api/v1/claims/claim_example_2/confirm'
		]);
		expect(JSON.parse(String(calls[2].init?.body))).toEqual({ token: 'plain-example-token' });
	});
});

describe('shapeSearchResults', () => {
	it('always returns at least one result, compacting a heavily linked business to fit', () => {
		const registers = Array.from({ length: 12 }, (_, i) => `example.register-${i}`);
		const linked: SearchResultItem = {
			...makeResult(1),
			canonical_name: 'Example Bank Limited',
			identifiers: Array.from({ length: 6 }, (_, i) => ({
				scheme: `example:scheme-${i}`,
				value: `value-${i}-0123456789abcdef`,
				source: registers[i]
			})),
			coverage: {
				applicable: registers,
				checked: registers.slice(0, 8),
				found_in: registers.slice(0, 3),
				not_yet_checked: registers.slice(8)
			},
			coverage_summary: 'found in 3 of 8 checked; 4 not yet checked'
		};
		const result = shapeSearchResults({
			query: 'example bank',
			district: '',
			total_count: 1,
			returned: 1,
			page_returned: 1,
			limit: 20,
			offset: 0,
			regeneration_id: 'regen-example-1',
			next_cursor: null,
			results: [linked]
		});
		const value = parsed(result);

		expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
		expect(value.returned).toBe(1);
		const [first] = value.results as { atlas_id: string; coverage: { found_in: string[] } }[];
		expect(first.atlas_id).toBe('atlas-1');
		expect(first.coverage.found_in).toEqual(registers.slice(0, 3));
	});

	it('reads a record with no published location as its country', () => {
		const kenyan: SearchResultItem = {
			...makeResult(2),
			canonical_name: 'Example Bank of Kenya Limited',
			country: 'KE',
			district: null,
			division: null,
			location: 'Kenya'
		};
		const value = parsed(
			shapeSearchResults({
				query: 'example bank of kenya',
				district: '',
				total_count: 1,
				returned: 1,
				page_returned: 1,
				limit: 20,
				offset: 0,
				regeneration_id: 'regen-example-1',
				next_cursor: null,
				results: [kenyan]
			})
		);
		const [first] = value.results as { location: string }[];

		expect(first.location).toBe('Kenya');
		expect(JSON.stringify(value)).not.toContain('Unknown');
	});

	it('tells a model the district it asked for is not in the data, and what is', () => {
		const value = parsed(
			shapeSearchResults({
				query: 'bank',
				district: 'Kampala District',
				total_count: 0,
				returned: 0,
				page_returned: 0,
				limit: 0,
				offset: 0,
				regeneration_id: null,
				next_cursor: null,
				results: [],
				district_known: false,
				nearest_districts: ['KAMPALA', 'WAKISO']
			})
		);

		expect(value.district_known).toBe(false);
		expect(value.nearest_districts).toEqual(['KAMPALA', 'WAKISO']);
	});

	it('returns one compact JSON text item with paging fields', () => {
		const response: SearchResponse = {
			query: 'example hardware',
			district: '',
			total_count: 4,
			returned: 1,
			page_returned: 1,
			limit: 1,
			offset: 0,
			regeneration_id: 'regen-example-1',
			next_cursor: 'next-page',
			results: [makeResult(1)]
		};
		const result = shapeSearchResults(response);
		const value = parsed(result);

		expect(value.total_count).toBe(4);
		expect(value.returned).toBe(1);
		expect(value.next_cursor).toBe('next-page');
		expect(result.content[0].text).toContain(scoreSummary);
	});

	it('truncates the result array and marks the structured response', () => {
		const results = Array.from({ length: 20 }, (_, index) => makeResult(index));
		const result = shapeSearchResults({
			query: 'example',
			district: '',
			total_count: 20,
			returned: 20,
			page_returned: 20,
			limit: 20,
			offset: 0,
			regeneration_id: 'regen-example-1',
			next_cursor: null,
			results
		});
		const value = parsed(result);

		expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
		expect(value.truncated).toBe(true);
		expect((value.results as unknown[]).length).toBeLessThan(20);
	});

	it('continues after the last result shown so every database result is reachable once', () => {
		const query = 'example trading';
		const district = 'Kampala';
		const regenerationId = 'regen-example-1';
		const allResults = Array.from({ length: 20 }, (_, index) => ({
			...makeResult(index),
			canonical_name: `Example ${index} ${'Trading House '.repeat(14)}`,
			identifiers: [],
			formality: null
		}));
		const seen: string[] = [];
		let offset = 0;

		for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
			const apiResults = allResults.slice(offset, offset + 20);
			const apiNextOffset = offset + apiResults.length;
			const result = shapeSearchResults({
				query,
				district,
				total_count: allResults.length,
				returned: apiResults.length,
				page_returned: apiResults.length,
				limit: 20,
				offset,
				regeneration_id: regenerationId,
				next_cursor:
					apiNextOffset < allResults.length
						? buildSearchCursor(apiNextOffset, query, district, regenerationId)
						: null,
				results: apiResults
			});
			const value = parsed(result);
			const shown = value.results as { atlas_id: string }[];
			if (pageNumber === 0) expect(shown).toHaveLength(2);
			seen.push(...shown.map((item) => item.atlas_id));

			const nextCursor = value.next_cursor as string | null;
			if (!nextCursor) break;
			offset = decodeCursor(
				nextCursor,
				'search',
				searchCursorContext(query, district),
				regenerationId
			);
		}

		expect(seen).toEqual(allResults.map((item) => item.atlas_id));
		expect(new Set(seen).size).toBe(allResults.length);
	});
});

describe('shapeBusinessRecord', () => {
	it('returns compact JSON with coverage and score sentences', () => {
		const result = shapeBusinessRecord(businessFixture);
		const value = parsed(result);

		expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
		expect((value.coverage as { summary: string }).summary).toBe(
			'found in 1 of 1 checked; 2 not yet checked'
		);
		expect(result.content[0].text).toContain('ura.vat_withholding_agents');
		expect(result.content[0].text).toContain(scoreSummary);
		expect(result.content[0].text).toContain('2026-08-29T09:05:00Z');
	});

	it('reads a record with no published location as its country', () => {
		const value = parsed(
			shapeBusinessRecord({
				...businessFixture,
				country: 'KE',
				district: null,
				division: null,
				location: 'Kenya'
			})
		);

		expect(value.location).toBe('Kenya');
	});

	it('returns structured errors', () => {
		expect(parsed(shapeToolError('business_not_found'))).toEqual({
			error: 'business_not_found'
		});
	});
});

describe('new tool result budgets', () => {
	it('bounds evidence, score, explanation, and segment JSON', () => {
		const longText = 'Example register value '.repeat(100);
		const evidenceResult = shapeEvidenceResults({
			atlas_id: 'atlas-example-1',
			mode: 'field',
			field: 'canonical_name',
			returned: 2,
			limit: 2,
			next_cursor: 'next-example',
			statements: Array.from({ length: 2 }, () => ({
				source: longText,
				source_ref: longText,
				asserted_at: '2026-08-01T00:00:00Z',
				precedence: 3,
				value: longText
			}))
		});
		const scoreResult = shapeScoreResult({
			...businessFixture.scores[0],
			evidence: Array.from({ length: 30 }, (_, index) => ({
				predicate: `example_predicate_${index}`,
				points: index,
				reason: longText
			}))
		});
		const explanationResult = shapeExplanationResult({
			atlas_id: 'atlas-example-1',
			rubric: 'formality',
			explanation: longText
		});
		const segmentResult = shapeSegmentResult({
			filters: {},
			total_count: 30,
			counts_by_division: Array.from({ length: 30 }, (_, index) => ({
				division: `Example Division ${index}`,
				count: index
			})),
			top_candidates: Array.from({ length: 10 }, (_, index) => ({
				atlas_id: `atlas-example-${index}`,
				canonical_name: longText,
				country: 'UG',
				district: 'Example District',
				division: 'Example Division',
				location: 'Example Division, Example District',
				sector_category: 'Trade',
				sector_nature: 'Hardware',
				formality: {
					value: 50,
					max: 100,
					checkable: 75,
					unknown: 25,
					version: 1,
					evaluation_as_of: '2026-08-29T09:05:00Z'
				}
			})),
			search_link: '/search?category=Trade'
		});

		for (const result of [evidenceResult, scoreResult, explanationResult, segmentResult]) {
			expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
			expect(() => JSON.parse(result.content[0].text)).not.toThrow();
		}
		expect((parsed(segmentResult).top_candidates as unknown[]).length).toBe(10);
	});
});

describe('shapeEvidenceResults grouping', () => {
	it('folds identical field statements into one entry with a count', () => {
		const statement = {
			source: 'ura.customs_agents',
			source_ref: 'https://example.invalid/customs',
			asserted_at: '2026-05-12T00:00:00Z',
			precedence: 2,
			value: 'EXAMPLE LIMITED'
		};
		const result = shapeEvidenceResults({
			atlas_id: 'atlas-1',
			mode: 'field',
			field: 'canonical_name',
			returned: 3,
			limit: 20,
			next_cursor: null,
			statements: [
				statement,
				statement,
				{ ...statement, source: 'unbs.certified_products', precedence: 3 }
			]
		});
		const value = parsed(result) as {
			returned: number;
			statements: { count: number; source: string }[];
		};
		expect(value.statements.map((s) => [s.source, s.count])).toEqual([
			['ura.customs_agents', 2],
			['unbs.certified_products', 1]
		]);
		expect(value.returned).toBe(2);
	});
});
