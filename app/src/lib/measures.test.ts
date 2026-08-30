// SPDX-License-Identifier: Apache-2.0
/**
 * A bar that sums to more or less than the whole is a bar that lies about how much was checked.
 * These are the cases the record page actually hits: a record found in one register of nine, a
 * rubric where nothing is checkable yet, and a score whose max is not 100.
 */

import { describe, expect, it } from 'vitest';
import { coverageSegments, scoreEarnedAndMissing, scoreSegments, widthOf } from './measures';

const sum = (segments: { earned: number; unearned: number; unknown: number }) =>
	segments.earned + segments.unearned + segments.unknown;

describe('scoreSegments', () => {
	it('normalises on the rubric max rather than on 100', () => {
		const segments = scoreSegments({ value: 25, max: 55, checkable: 25, unknown: 30 });
		expect(segments.earned).toBeCloseTo((25 / 55) * 100);
		expect(sum(segments)).toBeCloseTo(100);
	});

	it('draws a rubric with nothing checkable as entirely unknown', () => {
		const segments = scoreSegments({ value: 0, max: 100, checkable: 0, unknown: 100 });
		expect(segments.unknown).toBe(100);
		expect(segments.earned).toBe(0);
		expect(sum(segments)).toBe(100);
	});

	it('draws a fully earned score as one whole bar', () => {
		const segments = scoreSegments({ value: 40, max: 40, checkable: 40, unknown: 0 });
		expect(segments.earned).toBe(100);
		expect(sum(segments)).toBe(100);
	});

	it('never draws past the whole, however the numbers arrive', () => {
		expect(sum(scoreSegments({ value: 80, max: 55, checkable: 55, unknown: 30 }))).toBeCloseTo(100);
		expect(sum(scoreSegments({ value: -5, max: 55, checkable: 0, unknown: 999 }))).toBeCloseTo(100);
	});

	it('has nothing to draw when a rubric has no maximum', () => {
		expect(scoreSegments({ value: 0, max: 0, checkable: 0, unknown: 0 })).toEqual({
			earned: 0,
			unearned: 0,
			unknown: 0
		});
	});
});

describe('coverageSegments', () => {
	it('splits applicable registers into found, checked without finding, and not yet checked', () => {
		const segments = coverageSegments({
			applicable: ['a', 'b', 'c', 'd'],
			checked: ['a', 'b', 'c'],
			found_in: ['a'],
			not_yet_checked: ['d']
		});

		expect(segments.earned).toBe(25);
		expect(segments.unearned).toBe(50);
		expect(segments.unknown).toBe(25);
		expect(sum(segments)).toBe(100);
	});

	it('is empty for a pack with no applicable registers rather than dividing by zero', () => {
		expect(
			coverageSegments({ applicable: [], checked: [], found_in: [], not_yet_checked: [] })
		).toEqual({ earned: 0, unearned: 0, unknown: 0 });
	});
});

describe('widthOf', () => {
	it('rounds to a width a browser renders without a seam', () => {
		expect(widthOf(33.333333)).toBe('33.33%');
		expect(widthOf(100)).toBe('100%');
	});
});

describe('scoreEarnedAndMissing', () => {
	const evidence = [
		{ predicate: 'tax_identity', points: 25 },
		{ predicate: 'trading_licence', points: 25 },
		{ predicate: 'sector_regulator', points: 20 },
		{ predicate: 'legal_register', points: 0, reason: 'register not checked yet' },
		{ predicate: 'procurement_history', points: 0, reason: 'checked, not found' }
	];

	it("names what earned and what is missing, in the rubric's own words", () => {
		const line = scoreEarnedAndMissing(evidence);

		expect(line.earned).toEqual(['tax identity', 'trading licence', 'sector regulator']);
		expect(line.missing).toEqual(['legal register (not checked)', 'procurement history']);
	});

	it('says nothing rather than an empty list when a rubric earned everything', () => {
		const line = scoreEarnedAndMissing([{ predicate: 'tax_identity', points: 25 }]);
		expect(line.missing).toEqual([]);
		expect(line.earned).toEqual(['tax identity']);
	});
});
