// SPDX-License-Identifier: Apache-2.0
/**
 * A filter that names a place the data does not carry should say which places it does carry.
 * Both a person and a model reach for "Kampala District" or "Nairobi" and deserve better than
 * an empty page with no explanation.
 */

import { describe, expect, it } from 'vitest';
import { nearestValues } from './nearest';

const DISTRICTS = ['KAMPALA', 'WAKISO', 'MUKONO', 'MBARARA', 'JINJA', 'Lira', 'MBALE'];

describe('nearestValues', () => {
	it('puts an exact match first, whatever its case', () => {
		expect(nearestValues('kampala', DISTRICTS)[0]).toBe('KAMPALA');
	});

	it('finds the value inside a longer phrase', () => {
		expect(nearestValues('Kampala District', DISTRICTS)[0]).toBe('KAMPALA');
		expect(nearestValues('greater mbarara', DISTRICTS)[0]).toBe('MBARARA');
	});

	it('forgives a typo of one or two characters', () => {
		expect(nearestValues('Wakisu', DISTRICTS)[0]).toBe('WAKISO');
		expect(nearestValues('Mukona', DISTRICTS)[0]).toBe('MUKONO');
	});

	it('returns at most the asked-for number, closest first', () => {
		const nearest = nearestValues('M', DISTRICTS, 2);
		expect(nearest).toHaveLength(2);
		expect(nearest.every((value) => DISTRICTS.includes(value))).toBe(true);
	});

	it('offers nothing rather than a wrong guess when nothing is close', () => {
		expect(nearestValues('Kigali', DISTRICTS)).toEqual([]);
		expect(nearestValues('', DISTRICTS)).toEqual([]);
	});
});
