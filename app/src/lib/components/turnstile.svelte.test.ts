// SPDX-License-Identifier: Apache-2.0
/**
 * The widget is a gate on a public form, so both of its states matter: a deployment that sets a
 * key shows it, and one that does not shows nothing at all rather than an empty box or a broken
 * script tag. The second state is what a fork and a local checkout run in.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('$app/state', () => ({ page: state }));

const Turnstile = (await import('./Turnstile.svelte')).default;

describe('Turnstile', () => {
	it('shows nothing when this deployment sets no site key', () => {
		state.data = {};

		const { container } = render(Turnstile);

		expect(container.querySelector('.cf-turnstile')).toBeNull();
	});

	it('carries the deployment site key into the widget the form reads', () => {
		state.data = { turnstileSiteKey: '0x4AAAAAAExample' };

		const { container } = render(Turnstile);

		expect(container.querySelector('.cf-turnstile')?.getAttribute('data-sitekey')).toBe(
			'0x4AAAAAAExample'
		);
	});
});
