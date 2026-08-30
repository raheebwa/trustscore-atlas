// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { scopeLine } from './scope';

describe('scopeLine', () => {
	it("says how many of a pack's registers are loaded when the page lists them all", () => {
		expect(scopeLine('Registers for', 'Uganda', 8, 12)).toBe(
			'Registers for Uganda · 8 of 12 registers loaded'
		);
		expect(scopeLine('Registers for', 'Kenya', 1, 1)).toBe('Registers for Kenya · 1 register');
	});

	it('names the pack in scope and how many registers stand behind it', () => {
		expect(scopeLine('Searching', 'Uganda', 9)).toBe('Searching Uganda · 9 registers');
		expect(scopeLine('Exploring', 'Kenya', 1)).toBe('Exploring Kenya · 1 register');
	});
});
