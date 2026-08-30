// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { formatCoverageSentence, formatScoreSentence, formatWhen } from './format';

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

describe('nextScheduledRun', () => {
	it('adds the cadence to the last run and reports never-run and irregular registers honestly', async () => {
		const { nextScheduledRun } = await import('./format');
		expect(nextScheduledRun('weekly', '2026-08-16T00:00:00Z')).toBe('2026-08-23');
		expect(nextScheduledRun('monthly', '2026-08-29T23:37:13Z')).toBe('2026-09-29');
		expect(nextScheduledRun('quarterly', '2026-05-12T00:00:00Z')).toBe('2026-08-12');
		expect(nextScheduledRun('annual', '2026-08-30T00:48:51Z')).toBe('2027-08-30');
		expect(nextScheduledRun('irregular', '2026-08-30T03:01:19Z')).toBe('on request');
		expect(nextScheduledRun('quarterly', null)).toBe('not scheduled');
	});
});

describe('formatWhen', () => {
	const now = new Date('2026-08-30T11:00:00Z');

	it('reads as a sentence in the pack zone, with the relative clause the reader actually uses', () => {
		const when = formatWhen('2026-08-30T04:00:00Z', { zone: 'Africa/Kampala', now });

		expect(when?.absolute).toBe('30 Aug 2026, 07:00 EAT');
		expect(when?.relative).toBe('7 hours ago');
		expect(when?.text).toBe('30 Aug 2026, 07:00 EAT (7 hours ago)');
		expect(when?.iso).toBe('2026-08-30T04:00:00Z');
	});

	it('drops the clock when only the day matters', () => {
		const when = formatWhen('2026-08-28T04:00:00Z', {
			zone: 'Africa/Kampala',
			now,
			showTime: false
		});

		expect(when?.absolute).toBe('28 Aug 2026');
		expect(when?.text).toBe('28 Aug 2026 (2 days ago)');
	});

	it('reads a moment inside the minute as just now, and a future one as ahead', () => {
		expect(formatWhen('2026-08-30T10:59:30Z', { now })?.relative).toBe('just now');
		expect(formatWhen('2026-08-30T14:00:00Z', { now })?.relative).toBe('in 3 hours');
	});

	it('names a zone it knows and falls back to the offset for one it does not', () => {
		expect(formatWhen('2026-08-30T04:00:00Z', { zone: 'Africa/Nairobi', now })?.absolute).toContain(
			'EAT'
		);
		expect(formatWhen('2026-08-30T04:00:00Z', { zone: 'Europe/Lisbon', now })?.absolute).toContain(
			'2026'
		);
	});

	it('returns nothing for a value it cannot read, so a caller renders nothing', () => {
		expect(formatWhen(null)).toBeNull();
		expect(formatWhen('')).toBeNull();
		expect(formatWhen('not a date')).toBeNull();
	});
});
