// SPDX-License-Identifier: Apache-2.0
/**
 * A pack's dot is read at a glance and believed, so the rule behind it is worth pinning: it takes
 * the worst state among the registers that pack has actually loaded, and never calls an empty pack
 * current.
 */

import { describe, expect, it } from 'vitest';
import { describeRegister, packFreshness } from './registers';

describe('describeRegister', () => {
	it('names a register the way a reader would, at one level', () => {
		expect(describeRegister('bou.supervised_institutions').short).toBe('Bank of Uganda');
		expect(describeRegister('ppda.ocds').short).toBe('Procurement authority');
	});

	// A register appears in the interface the day its pack lands, not the day someone edits a map.
	it('falls back to the publisher and the rest of the slug for a register it has never seen', () => {
		const described = describeRegister('nssf.member_employers');

		expect(described.short).toBe('NSSF member employers');
		expect(described.kind).toBe('regulator');
	});
});

describe('packFreshness', () => {
	const source = (country: string, status: string) => ({ country, status });

	it('says a pack is current when every register it loaded is fresh', () => {
		const freshness = packFreshness([source('UG', 'fresh'), source('UG', 'fresh')], 'UG');

		expect(freshness).toEqual({ state: 'fresh', label: 'Every register is current' });
	});

	// The worst state wins: a dot that reported the best of them would be reassuring and wrong.
	it('reports a stale register, and a failed one above it', () => {
		expect(packFreshness([source('UG', 'fresh'), source('UG', 'stale')], 'UG').state).toBe('stale');
		expect(packFreshness([source('UG', 'stale'), source('UG', 'failed')], 'UG').state).toBe(
			'failed'
		);
	});

	it('says nothing is loaded rather than calling an empty pack fresh', () => {
		expect(packFreshness([source('UG', 'not_loaded')], 'UG').state).toBe('none');
	});

	it('reads only the pack it was asked about', () => {
		const freshness = packFreshness([source('UG', 'failed'), source('KE', 'fresh')], 'KE');

		expect(freshness.state).toBe('fresh');
	});
});
