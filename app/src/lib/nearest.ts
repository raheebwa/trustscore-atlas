// SPDX-License-Identifier: Apache-2.0
/**
 * The values closest to what someone asked for, used when a filter names something the data does
 * not carry. An empty page is a dead end; an empty page that says "the data has KAMPALA and
 * WAKISO" is a next step.
 *
 * The comparison is deliberately small: a containment check either way, then an edit distance
 * with a tight ceiling. Anything cleverer would start suggesting values that are merely nearby in
 * spelling, and a wrong suggestion costs more than none.
 */

const MAX_EDITS = 2;

function editDistance(a: string, b: string, ceiling: number): number {
	if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		const current = [i];
		let best = i;
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
			best = Math.min(best, current[j]);
		}
		if (best > ceiling) return ceiling + 1;
		previous = current;
	}
	return previous[b.length];
}

export function nearestValues(query: string, values: string[], limit = 3): string[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [];

	const scored: { value: string; score: number }[] = [];
	for (const value of values) {
		const candidate = value.toLowerCase();
		if (candidate === needle) {
			scored.push({ value, score: 0 });
			continue;
		}
		if (candidate.includes(needle) || needle.includes(candidate)) {
			scored.push({ value, score: 1 + Math.abs(candidate.length - needle.length) / 100 });
			continue;
		}
		const distance = editDistance(needle, candidate, MAX_EDITS);
		if (distance <= MAX_EDITS) scored.push({ value, score: 2 + distance });
	}

	return scored
		.sort((a, b) => a.score - b.score || a.value.localeCompare(b.value))
		.slice(0, limit)
		.map((entry) => entry.value);
}
