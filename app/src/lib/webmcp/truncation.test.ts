// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { MAX_TOOL_RESULT_CHARS, shapeBusinessRecord } from './tools';
import type { BusinessRecordResponse } from '$lib/types';

const registers = [
	'kcca.businesses',
	'kcca.property_rates',
	'ura.vat_withholding_agents',
	'ura.customs_agents',
	'ura.wht_exemptions',
	'ppda.ocds',
	'unbs.certified_products',
	'bou.supervised_institutions',
	'cma.licensed_firms',
	'urbra.licensed_schemes',
	'ucc.broadcasters',
	'nlgrb.gaming_operators'
];

function record(): BusinessRecordResponse {
	return {
		atlas_id: 'atl_0000000000000001',
		country: 'UG',
		canonical_name: 'EXAMPLE HARDWARE SUPPLIES LTD',
		entity_kind: 'company',
		district: 'Kampala',
		division: 'Nakawa Division',
		sector_category: 'GENERAL',
		sector_nature: 'Retailers',
		first_seen: '2026-08-01',
		last_seen: '2026-08-29',
		identifiers: [
			{ scheme: 'ug:kcca_licence', value: '0123456789abcdef', source: 'kcca.businesses' }
		],
		coverage: {
			applicable: registers,
			checked: [registers[0]],
			found_in: [registers[0]],
			not_yet_checked: registers.slice(1)
		},
		coverage_summary: 'found in 1 of 1 checked; 11 not yet checked',
		scores: [
			{
				rubric: 'formality',
				version: 1,
				value: 25,
				max: 100,
				checkable: 25,
				unknown: 75,
				unknown_predicates: [
					'legal_register_presence',
					'tax_identity_present',
					'sector_regulator_licence'
				],
				coverage: { applicable: 12, checked: 1, found_in: 1, not_yet_checked: 11 },
				coverage_summary: 'found in 1 of 1 checked; 11 not yet checked',
				evaluation_as_of: '2026-08-29T21:29:58Z',
				summary:
					'Formality 25 of 25 checkable; 75 unknown (not yet checked: legal_register_presence, tax_identity_present, sector_regulator_licence)'
			}
		],
		sources: [
			{
				slug: 'kcca.businesses',
				title: 'Licensed businesses',
				last_run_at: '2026-08-29T20:43:23Z'
			},
			{
				slug: 'ura.vat_withholding_agents',
				title: 'VAT withholding agents',
				last_run_at: '2026-08-29T20:43:23Z'
			}
		]
	} as unknown as BusinessRecordResponse;
}

describe('get_business truncation priority', () => {
	it('keeps identifiers and scores when the coverage lists have to be cut to fit the budget', () => {
		const result = shapeBusinessRecord(record());
		const text = result.content[0].text;
		expect(text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
		const payload = JSON.parse(text);
		expect(payload.truncated).toBe(true);
		expect(payload.identifiers).toHaveLength(1);
		expect(payload.scores).toHaveLength(1);
		expect(payload.coverage.summary).toBe('found in 1 of 1 checked; 11 not yet checked');
	});
});
