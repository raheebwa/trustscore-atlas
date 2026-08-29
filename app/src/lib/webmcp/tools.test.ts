import { describe, expect, it } from 'vitest';
import {
	GET_BUSINESS_TOOL,
	MAX_TOOL_RESULT_CHARS,
	SEARCH_BUSINESSES_TOOL,
	shapeBusinessRecord,
	shapeSearchResults,
	shapeToolError,
	type ToolTextResult
} from './tools';
import type { BusinessRecordResponse, SearchResponse, SearchResultItem } from '$lib/types';

const scoreSummary =
	'Formality 25 of 55 checkable; 45 unknown (not yet checked: ura.vat_withholding_agents, ppda.ocds)';

function makeResult(index: number): SearchResultItem {
	return {
		atlas_id: `atlas-${index}`,
		canonical_name: `Example Hardware Supplies ${index} Ltd`,
		division: 'Nakawa',
		district: 'Kampala',
		sector_category: 'Trade',
		sector_nature: 'Hardware',
		identifiers: [{ scheme: 'ug:kcca_licence', value: `KCCA-${index}`, source: 'kcca.businesses' }],
		formality: {
			rubric: 'formality',
			version: 1,
			value: 25,
			max: 100,
			checkable: 55,
			unknown: 45,
			unknown_predicates: ['ura.vat_withholding_agents', 'ppda.ocds'],
			evaluation_as_of: '2026-08-29T09:05:00Z',
			summary: scoreSummary
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
			status: 'fresh'
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
	for (const definition of [SEARCH_BUSINESSES_TOOL, GET_BUSINESS_TOOL]) {
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
});

describe('shapeSearchResults', () => {
	it('returns one compact JSON text item with paging fields', () => {
		const response: SearchResponse = {
			query: 'example hardware',
			total_count: 4,
			returned: 1,
			limit: 1,
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
			total_count: 20,
			returned: 20,
			limit: 20,
			next_cursor: null,
			results
		});
		const value = parsed(result);

		expect(result.content[0].text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
		expect(value.truncated).toBe(true);
		expect((value.results as unknown[]).length).toBeLessThan(20);
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

	it('returns structured errors', () => {
		expect(parsed(shapeToolError('business_not_found'))).toEqual({
			error: 'business_not_found'
		});
	});
});
