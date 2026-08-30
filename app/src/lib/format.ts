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

/** Scheme order for identifier summaries: the tax identity first, then licences and permits. */
const SCHEME_ORDER = [
	'tin',
	'kcca_licence',
	'bou_code',
	'nlgrb_licence',
	'unbs_permit',
	'customs_licence',
	'ppda_party_id'
];

function schemeRank(scheme: string): number {
	const short = scheme.split(':').pop() ?? scheme;
	const index = SCHEME_ORDER.indexOf(short);
	return index === -1 ? SCHEME_ORDER.length : index;
}

/**
 * One entry per scheme for cards and tool results: the value when a scheme has one, or
 * "scheme x N" when it has several (a manufacturer with fourteen customs licences). Duplicates
 * of the same scheme and value from two registers count once. The full list stays on the record.
 */
export function summariseIdentifiers(
	identifiers: { scheme: string; value: string; source?: string | null }[]
): string[] {
	const values = new Map<string, Set<string>>();
	for (const identifier of identifiers) {
		const set = values.get(identifier.scheme) ?? new Set<string>();
		set.add(identifier.value);
		values.set(identifier.scheme, set);
	}
	return [...values.entries()]
		.sort((a, b) => schemeRank(a[0]) - schemeRank(b[0]) || a[0].localeCompare(b[0]))
		.map(([scheme, set]) =>
			set.size === 1 ? `${scheme} ${[...set][0]}` : `${scheme} x${set.size}`
		);
}

/**
 * When a register is next due from its cadence and last accepted run, as a date; irregular
 * registers are pulled on request and a register never pulled has no schedule yet.
 */
export function nextScheduledRun(cadence: string, lastRunAt: string | null): string {
	const key = cadence.trim().toLowerCase();
	if (key === 'irregular') return 'on request';
	if (!lastRunAt) return 'not scheduled';
	const last = new Date(lastRunAt);
	if (Number.isNaN(last.getTime())) return 'not scheduled';
	const next = new Date(last);
	if (key === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
	else if (key === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
	else if (key === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
	else if (key === 'annual') next.setUTCFullYear(next.getUTCFullYear() + 1);
	else return 'not scheduled';
	return next.toISOString().slice(0, 10);
}
