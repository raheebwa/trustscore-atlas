// SPDX-License-Identifier: Apache-2.0
/**
 * The arithmetic behind every bar on the site, kept out of the components so it can be tested on
 * its own and so two bars can never disagree.
 *
 * A score is three quantities, not one: what was earned, what was checkable and not earned, and
 * what nobody has checked yet. Drawing only the first would make a record with one register look
 * the same as a record with nine. Every bar therefore normalises on the rubric's own max, never
 * on 100, and the unknown mass is drawn as a hatch rather than a colour, because it is an absence
 * of evidence and not a value.
 */

export interface ScoreShape {
	value: number;
	max: number;
	checkable: number;
	unknown: number;
}

export interface Segments {
	earned: number;
	unearned: number;
	unknown: number;
}

function clamp(value: number, ceiling: number): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	return Math.min(value, ceiling);
}

/**
 * Percentages of the rubric's max, summing to 100 whenever the max is positive. A rubric with
 * nothing checkable is entirely unknown; a max of zero has nothing to draw at all.
 */
export function scoreSegments(score: ScoreShape): Segments {
	const max = Number.isFinite(score.max) && score.max > 0 ? score.max : 0;
	if (max === 0) return { earned: 0, unearned: 0, unknown: 0 };

	const earnedPoints = clamp(score.value, max);
	const unknownPoints = clamp(score.unknown, max - earnedPoints);
	const unearnedPoints = max - earnedPoints - unknownPoints;

	const earned = (earnedPoints / max) * 100;
	const unknown = (unknownPoints / max) * 100;
	return { earned, unearned: (unearnedPoints / max) * 100, unknown };
}

export interface CoverageLengths {
	applicable: string[];
	checked: string[];
	found_in: string[];
	not_yet_checked: string[];
}

/**
 * Coverage in the same three parts: registers the record was found in, registers checked without
 * finding it, and registers not yet checked. The denominator is what applies to this country's
 * pack, so a Kenyan record is never marked down for a Ugandan register.
 */
export function coverageSegments(coverage: CoverageLengths): Segments {
	const found = coverage.found_in.length;
	const checked = Math.max(coverage.checked.length, found);
	const applicable = Math.max(coverage.applicable.length, checked);
	if (applicable === 0) return { earned: 0, unearned: 0, unknown: 0 };

	return {
		earned: (found / applicable) * 100,
		unearned: ((checked - found) / applicable) * 100,
		unknown: ((applicable - checked) / applicable) * 100
	};
}

/** A width a browser can render without a sub-pixel gap between segments. */
export function widthOf(percentage: number): string {
	return `${Math.round(percentage * 100) / 100}%`;
}
