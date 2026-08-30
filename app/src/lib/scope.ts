// SPDX-License-Identifier: Apache-2.0
/**
 * The line every scoped page carries under its title. The country switch scopes the whole site,
 * so each page has to say which pack it is showing and how much of it is loaded: a count with no
 * scope is a count a reader can misread, and two pages showing different packs look identical
 * without it.
 */

export function scopeLine(
	verb: string,
	countryName: string,
	registers: number,
	total?: number
): string {
	const noun = registers === 1 ? 'register' : 'registers';
	// A page that lists registers it has not loaded says so, rather than letting a reader count
	// twelve rows under a line that claims eight.
	if (total !== undefined && total !== registers) {
		return `${verb} ${countryName} · ${registers} of ${total} registers loaded`;
	}
	return `${verb} ${countryName} · ${registers} ${noun}`;
}
