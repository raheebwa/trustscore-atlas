import { describe, expect, it } from 'vitest';
import { formatCoverageSentence, formatScoreSentence } from './format';

describe('formatCoverageSentence', () => {
	it('uses checked and pending register counts', () => {
		expect(
			formatCoverageSentence({
				checked: ['kcca.businesses', 'ura.tin'],
				found_in: ['kcca.businesses'],
				not_yet_checked: ['ura.vat_withholding_agents', 'ppda.ocds']
			})
		).toBe('found in 1 of 2 checked; 2 not yet checked');
	});
});

describe('formatScoreSentence', () => {
	it('shows value, checkable points, unknown points, and pending predicates', () => {
		expect(
			formatScoreSentence({
				rubric: 'formality',
				value: 25,
				checkable: 55,
				unknown: 45,
				unknown_predicates: ['ura.vat_withholding_agents', 'ppda.ocds']
			})
		).toBe(
			'Formality 25 of 55 checkable; 45 unknown (not yet checked: ura.vat_withholding_agents, ppda.ocds)'
		);
	});
});

describe('identifierKey', () => {
	it('keeps the same identifier from two registers apart', async () => {
		const { identifierKey } = await import('./format');
		const customs = { scheme: 'ug:tin', value: '1000000000', source: 'ura.customs_agents' };
		const vat = { scheme: 'ug:tin', value: '1000000000', source: 'ura.vat_withholding_agents' };
		expect(identifierKey(customs)).not.toBe(identifierKey(vat));
		expect(identifierKey(customs)).toBe('ug:tin 1000000000 ura.customs_agents');
	});
});

describe('summariseIdentifiers', () => {
	it('shows one entry per scheme in the agreed order, counting duplicates once', async () => {
		const { summariseIdentifiers } = await import('./format');
		expect(
			summariseIdentifiers([
				{ scheme: 'ug:unbs_permit', value: 'p1', source: 'unbs.certified_products' },
				{ scheme: 'ug:unbs_permit', value: 'p2', source: 'unbs.certified_products' },
				{ scheme: 'ug:customs_licence', value: 'c1', source: 'ura.customs_agents' },
				{ scheme: 'ug:tin', value: '1000000000', source: 'ura.customs_agents' },
				{ scheme: 'ug:tin', value: '1000000000', source: 'ura.vat_withholding_agents' },
				{ scheme: 'ug:kcca_licence', value: 'abc', source: 'kcca.businesses' },
				{ scheme: 'ug:kcca_licence', value: 'def', source: 'kcca.businesses' },
				{ scheme: 'ke:other', value: 'z', source: 'cbk.licensed_banks' }
			])
		).toEqual([
			'ug:tin 1000000000',
			'ug:kcca_licence x2',
			'ug:unbs_permit x2',
			'ug:customs_licence c1',
			'ke:other z'
		]);
	});
});
