// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { greet } from './greet';

describe('greet', () => {
	it('returns a greeting', () => {
		expect(greet('Svelte')).toBe('Hello, Svelte!');
	});
});
