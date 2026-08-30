// SPDX-License-Identifier: Apache-2.0
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
	identifiers: { scheme: string; value: string; source?: string | null; synthetic?: boolean }[]
): string[] {
	const values = new Map<string, Set<string>>();
	const synthetic = new Set<string>();
	for (const identifier of identifiers) {
		const set = values.get(identifier.scheme) ?? new Set<string>();
		set.add(identifier.value);
		values.set(identifier.scheme, set);
		if (identifier.synthetic) synthetic.add(identifier.scheme);
	}
	return [...values.entries()]
		.sort((a, b) => schemeRank(a[0]) - schemeRank(b[0]) || a[0].localeCompare(b[0]))
		.map(([scheme, set]) => {
			// A synthetic scheme is Atlas's key for a register row, not a number the register
			// issued. Quoting it would invite someone to take it back to the register, where it
			// means nothing, so the count stands in for the value.
			if (synthetic.has(scheme)) return `${scheme} x${set.size}`;
			return set.size === 1 ? `${scheme} ${[...set][0]}` : `${scheme} x${set.size}`;
		});
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

/**
 * How a timestamp reads to a person: an absolute moment in the pack's own zone plus the relative
 * clause a reader actually uses. Machine-readable values (the ISO stamp, the regeneration id)
 * belong in a title attribute, a disclosure, the API and tool results, never in a sentence.
 */
export interface When {
	iso: string;
	absolute: string;
	relative: string;
	text: string;
	zone: string;
}

/**
 * ICU renders East Africa Time as "GMT+3", which is not what anyone in Kampala calls it.
 * A zone the map does not name keeps whatever ICU offers.
 */
const ZONE_ABBREVIATIONS: Record<string, string> = {
	'Africa/Kampala': 'EAT',
	'Africa/Nairobi': 'EAT',
	'Africa/Dar_es_Salaam': 'EAT',
	'Africa/Kigali': 'CAT',
	'Africa/Addis_Ababa': 'EAT',
	UTC: 'UTC'
};

export const DEFAULT_ZONE = 'Africa/Kampala';

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['week', 7 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60]
];

function relativeClause(seconds: number): string {
	const magnitude = Math.abs(seconds);
	if (magnitude < 60) return 'just now';
	const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	// seconds is negative in the past, which is exactly the sign Intl wants.
	for (const [unit, size] of RELATIVE_STEPS) {
		if (magnitude >= size) return formatter.format(Math.round(seconds / size), unit);
	}
	return 'just now';
}

export function formatWhen(
	value: string | null | undefined,
	options: { zone?: string; now?: Date; showTime?: boolean } = {}
): When | null {
	if (!value) return null;
	const moment = new Date(value);
	if (Number.isNaN(moment.getTime())) return null;

	const zone = options.zone?.trim() || DEFAULT_ZONE;
	const showTime = options.showTime !== false;
	const parts: Intl.DateTimeFormatOptions = {
		timeZone: zone,
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	};
	if (showTime) {
		parts.hour = '2-digit';
		parts.minute = '2-digit';
		parts.hour12 = false;
	}

	let absolute: string;
	try {
		absolute = new Intl.DateTimeFormat('en-GB', parts).format(moment);
	} catch {
		// A runtime without this zone still owes the reader a date.
		absolute = new Intl.DateTimeFormat('en-GB', { ...parts, timeZone: 'UTC' }).format(moment);
	}
	if (showTime) {
		const abbreviation =
			ZONE_ABBREVIATIONS[zone] ??
			new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' })
				.formatToParts(moment)
				.find((part) => part.type === 'timeZoneName')?.value ??
			'UTC';
		absolute = `${absolute} ${abbreviation}`;
	}

	const now = options.now ?? new Date();
	const relative = relativeClause((moment.getTime() - now.getTime()) / 1000);
	return { iso: value, absolute, relative, text: `${absolute} (${relative})`, zone };
}

/**
 * A published value as a person should read it. Most fields are already plain text; the
 * identifiers field carries the statement's own JSON, and a provenance table full of
 * {"scheme":"ug:tin","value":"1000026854"} is a table nobody reads.
 */
export function displayFieldValue(field: string, value: string): string {
	const text = value?.trim() ?? '';
	if (!text.startsWith('{') && !text.startsWith('[')) return value;
	try {
		const parsed: unknown = JSON.parse(text);
		const list = Array.isArray(parsed) ? parsed : [parsed];
		const identifiers = list.filter(
			(entry): entry is { scheme: string; value: string } =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as { scheme?: unknown }).scheme === 'string' &&
				typeof (entry as { value?: unknown }).value === 'string'
		);
		if (identifiers.length === 0) return value;
		return identifiers.map((entry) => `${entry.scheme} ${entry.value}`).join(', ');
	} catch {
		// Text that only looks like JSON is still what the register published.
		return value;
	}
}

/**
 * A value a register published as a key, read as words: "commercial_bank" is a slug, and a page
 * that prints it is asking a reader to decode a database column. Values that are already names
 * keep their own capitalisation beyond the first word.
 */
export function humaniseValue(value: string | null | undefined): string {
	const text = value?.trim();
	if (!text) return '';
	const words = text.replace(/[_-]+/g, ' ').trim();
	// A value shouted in capitals is a key, not a name; a mixed-case value is already written.
	const normalised = words === words.toUpperCase() ? words.toLowerCase() : words;
	return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}
