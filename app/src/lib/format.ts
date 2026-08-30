/** Turns a dotted statement field path into a readable label, e.g. "sector.source_category" -> "Sector › Source Category". */
export function formatFieldLabel(field: string): string {
	return field
		.split('.')
		.map((segment) => segment.replace(/_/g, ' '))
		.join(' › ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

interface CoverageLengths {
	checked: number | readonly unknown[];
	found_in: number | readonly unknown[];
	not_yet_checked: number | readonly unknown[];
}

interface ScoreSentenceInput {
	rubric: string;
	value: number;
	checkable: number;
	unknown: number;
	unknown_predicates: readonly string[];
}

function lengthOf(value: number | readonly unknown[]): number {
	return typeof value === 'number' ? value : value.length;
}

export function formatCoverageSentence(coverage: CoverageLengths): string {
	return `found in ${lengthOf(coverage.found_in)} of ${lengthOf(coverage.checked)} checked; ${lengthOf(coverage.not_yet_checked)} not yet checked`;
}

export function formatScoreSentence(score: ScoreSentenceInput): string {
	const label = score.rubric
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (character) => character.toUpperCase());
	const unknownList =
		score.unknown_predicates.length > 0
			? ` (not yet checked: ${score.unknown_predicates.join(', ')})`
			: '';
	return `${label} ${score.value} of ${score.checkable} checkable; ${score.unknown} unknown${unknownList}`;
}

/**
 * List key for an identifier row: the same scheme and value can come from two registers
 * (a TIN on both URA lists), so the source is part of the identity.
 */
export function identifierKey(identifier: {
	scheme: string;
	value: string;
	source?: string | null;
}): string {
	return [identifier.scheme, identifier.value, identifier.source ?? ''].join(' ');
}

/** Display labels for an identifier list, one per scheme and value (a TIN on two lists shows once). */
export function identifierLabels(
	identifiers: { scheme: string; value: string; source?: string | null }[]
): string[] {
	const seen = new Set<string>();
	const labels: string[] = [];
	for (const identifier of identifiers) {
		const label = `${identifier.scheme}: ${identifier.value}`;
		if (seen.has(label)) continue;
		seen.add(label);
		labels.push(label);
	}
	return labels;
}
