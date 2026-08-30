// SPDX-License-Identifier: Apache-2.0
/**
 * One test per state the brief names, because a component that ships four of its six states is
 * how an interface starts feeling unfinished: a disabled button that still looks clickable, a
 * loading area that flashes a spinner, an empty screen that says nothing.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Button from './Button.svelte';
import Callout from './Callout.svelte';
import Chip from './Chip.svelte';
import EmptyState from './EmptyState.svelte';
import Field from './Field.svelte';
import PageHeader from './PageHeader.svelte';
import Select from './Select.svelte';
import Skeleton from './Skeleton.svelte';
import Toast from './Toast.svelte';
import { showToast } from './toast-state.svelte';
import { createRawSnippet } from 'svelte';

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('Button', () => {
	it('carries its label, and reports work in progress instead of leaving the label clickable', async () => {
		const { rerender } = render(Button, { children: text('Approve claim') });
		expect(screen.getByRole('button')).toHaveTextContent('Approve claim');
		expect(screen.getByRole('button')).not.toBeDisabled();

		await rerender({ children: text('Approve claim'), loading: true, loadingLabel: 'Approving' });
		expect(screen.getByRole('button')).toHaveTextContent('Approving');
		expect(screen.getByRole('button')).toBeDisabled();
		expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
	});

	it('says it is disabled to a screen reader as well as to a mouse', () => {
		render(Button, { children: text('Save'), disabled: true });
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('renders a link when the caller hands it a resolved route', () => {
		render(Button, { children: text('Open record'), as: 'link', href: '/b/atl_1' });
		expect(screen.getByRole('link')).toHaveAttribute('href', '/b/atl_1');
	});
});

describe('Callout', () => {
	it('announces an error tone, and stays quiet for information', () => {
		const { unmount } = render(Callout, { tone: 'error', children: text('That link expired.') });
		expect(screen.getByRole('alert')).toHaveTextContent('That link expired.');
		unmount();

		render(Callout, { tone: 'info', title: 'Not a credit verdict', children: text('A score is') });
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByText('Not a credit verdict')).toBeVisible();
	});
});

describe('Chip', () => {
	it('names the filter it would remove', async () => {
		let removed = false;
		render(Chip, { label: 'District', value: 'Kampala', onDismiss: () => (removed = true) });

		const button = screen.getByRole('button', { name: 'Remove the District filter' });
		await userEvent.click(button);
		expect(removed).toBe(true);
	});

	it('has nothing to dismiss when it is only reporting a value', () => {
		render(Chip, { label: 'Register', value: 'kcca.businesses' });
		expect(screen.queryByRole('button')).toBeNull();
	});
});

describe('Field', () => {
	it('ties its label, hint and error to the control a person is typing in', () => {
		render(Field, {
			id: 'district',
			label: 'District',
			hint: 'Values come from the data',
			children: createRawSnippet<[{ id: string; describedBy: string | undefined }]>((props) => {
				const { id, describedBy } = props();
				return {
					render: () =>
						`<input id="${id}" ${describedBy ? `aria-describedby="${describedBy}"` : ''} />`
				};
			})
		});

		const input = screen.getByLabelText('District');
		expect(input).toHaveAttribute('aria-describedby', 'district-hint');
		expect(screen.getByText('Values come from the data')).toBeVisible();
	});

	it('replaces the hint with the error, so only one instruction is on screen', () => {
		render(Field, {
			id: 'email',
			label: 'Email',
			hint: 'Use the address on the register',
			error: 'That domain is not on this record.',
			children: createRawSnippet<[{ id: string; describedBy: string | undefined }]>((props) => {
				const { id, describedBy } = props();
				return { render: () => `<input id="${id}" aria-describedby="${describedBy}" />` };
			})
		});

		expect(screen.getByText('That domain is not on this record.')).toBeVisible();
		expect(screen.queryByText('Use the address on the register')).toBeNull();
		expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'email-error');
	});
});

describe('Select', () => {
	it('offers the placeholder as a real choice and reports what was chosen', async () => {
		render(Select, {
			options: [
				{ value: 'UG', label: 'Uganda' },
				{ value: 'KE', label: 'Kenya' }
			],
			placeholder: 'Any country'
		});

		const select = screen.getByRole('combobox');
		expect(screen.getByRole('option', { name: 'Any country' })).toBeVisible();
		await userEvent.selectOptions(select, 'KE');
		expect(select).toHaveValue('KE');
	});
});

describe('Skeleton', () => {
	it('is a labelled placeholder, never a spinner', () => {
		render(Skeleton, { variant: 'row' });
		const status = screen.getByRole('status', { name: 'Loading' });
		expect(status).toBeVisible();
		expect(status.querySelector('.skeleton')).not.toBeNull();
	});
});

describe('EmptyState', () => {
	it('teaches the next move with real examples rather than saying nothing is here', () => {
		render(EmptyState, {
			title: 'No results for that name',
			body: 'Try a shorter name, or drop a filter.',
			examples: [
				{ label: 'Roofings', href: '/search?q=Roofings' },
				{ label: 'Tororo Cement', href: '/search?q=Tororo+Cement' }
			]
		});

		expect(screen.getByText('No results for that name')).toBeVisible();
		expect(screen.getByRole('link', { name: 'Roofings' })).toHaveAttribute(
			'href',
			'/search?q=Roofings'
		);
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});
});

describe('PageHeader', () => {
	it('gives the page one heading and its meta line', () => {
		render(PageHeader, {
			title: 'Explore segments',
			lede: 'Counts by district, register and sector.',
			meta: ['79,078 businesses', '9 of 13 registers']
		});

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Explore segments');
		expect(screen.getByText('79,078 businesses')).toBeVisible();
	});
});

describe('Toast', () => {
	it('announces politely and says what happened', async () => {
		render(Toast);
		showToast('Copied the atlas_id', 'success');
		expect(await screen.findByText('Copied the atlas_id')).toBeVisible();
		expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
	});
});
