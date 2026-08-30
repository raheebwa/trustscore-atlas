// SPDX-License-Identifier: Apache-2.0
/**
 * The data components carry the parts of the interface a reader trusts with numbers: a table that
 * has to survive a phone, badges that name a register in words, and paging that says where you
 * are before it says where to go.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DataTable from './DataTable.svelte';
import FreshnessBadge from './FreshnessBadge.svelte';
import Pagination from './Pagination.svelte';
import RegisterBadge from './RegisterBadge.svelte';
import IdentifierChips from './IdentifierChips.svelte';
import type { Column } from './table';

// The table is generic over its row; a test renders it with the plainest row type there is.
type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
	{ key: 'register', label: 'Register', primary: true },
	{ key: 'businesses', label: 'Businesses', numeric: true, align: 'end', sortable: true }
];

const rows: Row[] = [
	{ register: 'kcca.businesses', businesses: 58658 },
	{ register: 'ppda.ocds', businesses: 11512 },
	{ register: 'ura.customs_agents', businesses: 11112 }
];

describe('DataTable', () => {
	it('sorts on a sortable column and says so to a screen reader', async () => {
		render(DataTable, { columns, rows, caption: 'Registers by business count' });

		const header = screen.getByRole('columnheader', { name: /Businesses/ });
		await userEvent.click(within(header).getByRole('button'));
		expect(header).toHaveAttribute('aria-sort', 'ascending');

		const firstRow = screen.getAllByRole('row')[1];
		expect(within(firstRow).getByText('11112')).toBeVisible();

		await userEvent.click(within(header).getByRole('button'));
		expect(header).toHaveAttribute('aria-sort', 'descending');
	});

	it('shows placeholder rows while loading rather than an empty table', () => {
		render(DataTable, { columns, rows: [], caption: 'Registers', loading: true });
		expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(0);
	});

	it('keeps every row readable on a phone by repeating the column label per value', () => {
		const { container } = render(DataTable, { columns, rows, caption: 'Registers' });
		const lists = container.querySelectorAll('dl');
		expect(lists).toHaveLength(rows.length);
		expect(lists[0].textContent).toContain('Register');
		expect(lists[0].textContent).toContain('kcca.businesses');
	});
});

describe('RegisterBadge', () => {
	it('names a register in words and keeps the slug for a machine', () => {
		render(RegisterBadge, { slug: 'ura.vat_withholding_agents' });
		const badge = screen.getByTitle('ura.vat_withholding_agents');
		expect(badge).toHaveTextContent('URA VAT agents');
	});

	it('still renders a register nobody has named yet', () => {
		render(RegisterBadge, { slug: 'nssf.registered_employers' });
		expect(screen.getByTitle('nssf.registered_employers')).toHaveTextContent(
			'NSSF registered employers'
		);
	});
});

describe('FreshnessBadge', () => {
	it('says how current a register is in the words the sources page uses', () => {
		render(FreshnessBadge, {
			status: 'stale',
			lastRunAt: '2026-05-12T00:00:00Z',
			cadence: 'quarterly'
		});
		expect(screen.getByText('Stale')).toBeVisible();
	});

	it('names a register that was never checked instead of showing an empty badge', () => {
		render(FreshnessBadge, { status: 'not_loaded', lastRunAt: null, cadence: 'quarterly' });
		expect(screen.getByText('Not yet checked')).toBeVisible();
	});
});

describe('Pagination', () => {
	it('says where you are, and offers no next page when there is none', () => {
		render(Pagination, { returned: 20, totalCount: 1284, nextHref: null });
		expect(screen.getByText('20')).toBeVisible();
		expect(screen.getByText('1,284')).toBeVisible();
		expect(screen.queryByRole('link', { name: /Next/ })).toBeNull();
	});

	it('offers the next page when the cursor says there is one', () => {
		render(Pagination, { returned: 20, totalCount: 1284, nextHref: '/search?cursor=abc' });
		expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute(
			'href',
			'/search?cursor=abc'
		);
	});
});

describe('IdentifierChips', () => {
	it('summarises identifiers and offers to copy one when asked', () => {
		render(IdentifierChips, {
			identifiers: [
				{ scheme: 'ug:tin', value: '1000123456', source: 'ura.customs_agents' },
				{ scheme: 'ug:kcca_licence', value: 'KCCA-1', source: 'kcca.businesses' }
			],
			copyable: true
		});

		expect(screen.getAllByRole('listitem')).toHaveLength(2);
		expect(screen.getAllByRole('button', { name: /^Copy / })).toHaveLength(2);
	});

	it('renders nothing at all when a record carries no identifier', () => {
		const { container } = render(IdentifierChips, { identifiers: [] });
		expect(container.querySelector('ul')).toBeNull();
	});
});
