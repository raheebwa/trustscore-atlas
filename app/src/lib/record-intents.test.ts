// SPDX-License-Identifier: Apache-2.0
/**
 * The intent switcher may change emphasis and wording. If it ever changes evidence, the page is
 * telling four different stories about one business, so these tests pin what it may touch.
 */

import { describe, expect, it } from 'vitest';
import { INTENTS, intentById, missingFor, uncheckedFor } from './record-intents';

describe('intents', () => {
	it('falls back to the overview for an unknown or missing intent', () => {
		expect(intentById(undefined).id).toBe('overview');
		expect(intentById('nonsense').id).toBe('overview');
		expect(intentById('lending').id).toBe('lending');
	});

	it('states a limit for every reader, since each one can reach a wrong conclusion', () => {
		for (const intent of INTENTS) {
			expect(intent.limit.length).toBeGreaterThan(20);
			expect(intent.question.endsWith('?')).toBe(true);
		}
	});

	it('says a lender may not read a credit assessment into this page', () => {
		expect(intentById('lending').limit).toContain('credit');
	});
});

describe('missingFor and uncheckedFor', () => {
	const lending = intentById('lending');

	it('separates a register that was checked without a match from one nobody has checked', () => {
		const checked = ['ura.vat_withholding_agents', 'bou.supervised_institutions'];
		const foundIn = ['bou.supervised_institutions'];

		expect(missingFor(lending, foundIn, checked)).toEqual(['ura.vat_withholding_agents']);
		expect(uncheckedFor(lending, checked)).toEqual(['ura.customs_agents']);
	});

	it('has nothing to report for a reader with no register of their own', () => {
		expect(missingFor(intentById('overview'), [], [])).toEqual([]);
		expect(uncheckedFor(intentById('owner'), [])).toEqual([]);
	});
});
