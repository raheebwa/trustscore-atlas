// SPDX-License-Identifier: Apache-2.0
/**
 * The bars are the part of Atlas that can mislead fastest: a full-looking score on a record
 * nobody has checked, or a coverage bar that hides how much is missing. Each test here pins one
 * of those.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import BarList from './BarList.svelte';
import CoverageBar from './CoverageBar.svelte';
import EvidenceRow from './EvidenceRow.svelte';
import PrecedenceLadder from './PrecedenceLadder.svelte';
import ScoreBar from './ScoreBar.svelte';
import StatTile from './StatTile.svelte';

const coverage = {
	applicable: [
		'kcca.businesses',
		'ura.vat_withholding_agents',
		'ppda.ocds',
		'unbs.certified_products'
	],
	checked: ['kcca.businesses', 'ura.vat_withholding_agents', 'ppda.ocds'],
	found_in: ['kcca.businesses'],
	not_yet_checked: ['unbs.certified_products']
};

function widths(container: HTMLElement): number[] {
	return [...container.querySelectorAll<HTMLElement>('[role=img] > div')].map((element) =>
		Number.parseFloat(element.style.width)
	);
}

describe('ScoreBar', () => {
	it('reads as earned of checkable with the unknown mass beside it, never as a miss', () => {
		render(ScoreBar, {
			score: {
				rubric: 'formality',
				value: 70,
				max: 100,
				checkable: 70,
				unknown: 30,
				unknown_predicates: ['legal_register']
			}
		});

		expect(screen.getByText('70')).toBeVisible();
		expect(screen.getByText(/of 70 checkable/)).toHaveTextContent('30 unknown');
	});

	it('normalises on the rubric max, never on 100', () => {
		const { container } = render(ScoreBar, {
			score: {
				rubric: 'formality',
				value: 25,
				max: 55,
				checkable: 25,
				unknown: 30,
				unknown_predicates: ['ppda_supplier']
			}
		});

		const [earned, unearned, unknown] = widths(container);
		expect(earned).toBeCloseTo(45.45, 1);
		expect(earned + unearned + unknown).toBeCloseTo(100, 1);
	});

	it('says the whole sentence to a screen reader, in the same words the API uses', () => {
		render(ScoreBar, {
			score: {
				rubric: 'formality',
				value: 25,
				max: 55,
				checkable: 25,
				unknown: 30,
				unknown_predicates: ['ppda_supplier']
			}
		});

		expect(
			screen.getByRole('img', {
				name: 'Formality 25 of 25 checkable; 30 unknown (not yet checked: ppda_supplier)'
			})
		).toBeVisible();
	});

	it('draws a rubric nobody has checked as entirely hatched, not as a zero score', () => {
		const { container } = render(ScoreBar, {
			score: {
				rubric: 'formality',
				value: 0,
				max: 100,
				checkable: 0,
				unknown: 100,
				unknown_predicates: []
			}
		});

		const [earned, , unknown] = widths(container);
		expect(earned).toBe(0);
		expect(unknown).toBe(100);
		expect(container.querySelector('.hatch')).not.toBeNull();
	});
});

describe('CoverageBar', () => {
	it('splits the applicable registers three ways and captions them in one sentence', () => {
		const { container } = render(CoverageBar, { coverage });

		const [found, checkedNotFound, notChecked] = widths(container);
		expect(found).toBe(25);
		expect(checkedNotFound).toBe(50);
		expect(notChecked).toBe(25);
		expect(screen.getByText('found in 1 of 3 checked; 1 not yet checked')).toBeVisible();
	});

	it('names each band when a legend is asked for', () => {
		render(CoverageBar, { coverage, showLegend: true });
		expect(screen.getByText('not yet checked')).toBeVisible();
		expect(screen.getByText('checked, not found')).toBeVisible();
	});
});

describe('StatTile', () => {
	it('leads with the label and never leaves the number without its sentence', () => {
		render(StatTile, {
			label: 'Businesses',
			value: 79078,
			caption: 'Across 2 country packs and 9 loaded registers.'
		});

		expect(screen.getByText('Businesses')).toBeVisible();
		expect(screen.getByText('79,078')).toBeVisible();
		expect(screen.getByText('Across 2 country packs and 9 loaded registers.')).toBeVisible();
	});
});

describe('BarList', () => {
	it('ranks rows against the largest, and offers the rest rather than hiding them', async () => {
		const rows = Array.from({ length: 15 }, (_, index) => ({
			key: `District ${index}`,
			count: 100 - index
		}));
		render(BarList, { rows, limit: 12 });

		expect(screen.getAllByRole('listitem')).toHaveLength(12);
		await userEvent.click(screen.getByRole('button', { name: /Show all 15/ }));
		expect(screen.getAllByRole('listitem')).toHaveLength(15);
	});

	it('links every row when the caller gives it a filter to apply', () => {
		render(BarList, {
			rows: [{ key: 'KAMPALA', count: 59861 }],
			hrefFor: (key: string) => `/explore?district=${key}`
		});
		expect(screen.getByRole('link')).toHaveAttribute('href', '/explore?district=KAMPALA');
	});
});

describe('EvidenceRow', () => {
	it('marks an unchecked predicate as unchecked rather than as a zero', () => {
		render(EvidenceRow, {
			item: { predicate: 'ppda_supplier', points: 0, reason: 'register not checked yet' }
		});
		expect(screen.getByLabelText('not yet checked')).toBeVisible();
	});

	it('marks an earned predicate and shows what it was worth', () => {
		render(EvidenceRow, { item: { predicate: 'trading_licence', points: 25 } });
		expect(screen.getByLabelText('earned')).toBeVisible();
		expect(screen.getByText('25')).toBeVisible();
	});
});

describe('PrecedenceLadder', () => {
	it('marks the rank that supplied the published value', () => {
		render(PrecedenceLadder, {
			ranks: [
				{ rank: 1, label: 'Operator verified', explanation: 'A verified claim.' },
				{ rank: 2, label: 'Regulator register', explanation: 'A supervising body.' },
				{ rank: 3, label: 'Municipal licence', explanation: 'A trading licence.' }
			],
			activeRank: 2
		});

		const steps = screen.getAllByRole('listitem');
		expect(steps[1]).toHaveAttribute('aria-current', 'step');
		expect(steps[0]).not.toHaveAttribute('aria-current');
	});
});
