// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET_EVIDENCE_TOOL, SEARCH_BUSINESSES_TOOL } from './tools';
import { scopeToBusiness, toolsForRoute } from './routes';

describe('toolsForRoute', () => {
	it('gives the home and search pages the search and segment tools plus reporting', () => {
		expect(toolsForRoute('/')).toEqual({
			names: ['search_businesses', 'find_segment', 'get_business', 'report_issue'],
			atlasId: null
		});
		expect(toolsForRoute('/search?q=x').names).toContain('search_businesses');
	});

	it('scopes the business page to that record with its evidence, score and write tools', () => {
		const result = toolsForRoute('/b/atl_0123456789abcdef');
		expect(result.atlasId).toBe('atl_0123456789abcdef');
		expect(result.names).toEqual([
			'get_business',
			'get_evidence',
			'score_business',
			'explain_score',
			'start_claim',
			'submit_correction',
			'label_linkage',
			'report_issue',
			'search_businesses'
		]);
		expect(toolsForRoute('/b/atl_0123456789abcdef/trace/website').atlasId).toBe(
			'atl_0123456789abcdef'
		);
	});

	it('gives the explorer find_segment and the tools page everything', () => {
		expect(toolsForRoute('/explore?country=UG').names).toEqual([
			'find_segment',
			'search_businesses',
			'get_business',
			'report_issue'
		]);
		expect(toolsForRoute('/tools').names.length).toBe(10);
	});

	it('registers nothing on the maintainer surface', () => {
		expect(toolsForRoute('/ops').names).toEqual([]);
	});
});

describe('scopeToBusiness', () => {
	it('makes atlas_id optional, explains the default and fills it in on execute', async () => {
		const calls: unknown[] = [];
		const scoped = scopeToBusiness(
			{
				...GET_EVIDENCE_TOOL,
				execute: async (input: Record<string, unknown>) => (calls.push(input), 'ok')
			},
			'atl_0123456789abcdef'
		);
		expect(scoped.inputSchema.required).not.toContain('atlas_id');
		expect(scoped.inputSchema.properties.atlas_id.description).toContain('this page');
		expect(scoped.description).toContain('atl_0123456789abcdef');
		await scoped.execute({ field: 'website' });
		await scoped.execute({ atlas_id: 'atl_other', field: 'website' });
		expect(calls).toEqual([
			{ atlas_id: 'atl_0123456789abcdef', field: 'website' },
			{ atlas_id: 'atl_other', field: 'website' }
		]);
	});

	it('leaves tools without an atlas_id input untouched', () => {
		const tool = { ...SEARCH_BUSINESSES_TOOL, execute: async () => 'ok' };
		expect(scopeToBusiness(tool, 'atl_0123456789abcdef')).toBe(tool);
	});
});
