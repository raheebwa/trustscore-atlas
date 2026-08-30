// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { scopeLine } from './scope';

describe('scopeLine', () => {
	it('names the pack in scope and how many registers stand behind it', () => {
		expect(scopeLine('Searching', 'Uganda', 9)).toBe('Searching Uganda · 9 registers');
		expect(scopeLine('Exploring', 'Kenya', 1)).toBe('Exploring Kenya · 1 register');
	});
});
