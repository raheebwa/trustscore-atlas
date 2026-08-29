/**
 * Pure helpers for the search query builder: FTS phrase escaping, the length
 * threshold that chooses FTS5 over the LIKE fallback, LIKE pattern escaping,
 * name normalisation for the fallback, and result-page clamping. No database
 * or platform binding is imported here, so these are unit testable in
 * isolation (docs/PRD.md 10.1/10.3, docs/ARCHITECTURE.md section 4.1 and 9).
 *
 * Callers must always pass the strings this module returns as bound
 * parameters (`?`) to D1 `prepare().bind()`, never interpolate them into SQL.
 */

export const FTS_MIN_QUERY_LENGTH = 3;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 20;

/** Trims and collapses internal whitespace. */
export function normalizeQuery(input: string): string {
	return input.trim().replace(/\s+/g, ' ');
}

export function shouldUseFts(query: string): boolean {
	return normalizeQuery(query).length >= FTS_MIN_QUERY_LENGTH;
}

/**
 * Wraps the query as a quoted FTS5 phrase so it is matched as literal text
 * rather than parsed as FTS query syntax (AND/OR/NOT, column filters, NEAR,
 * prefix `*`, and so on). Internal double quotes are doubled per FTS5 string
 * literal rules.
 */
export function escapeFtsPhrase(query: string): string {
	const normalized = normalizeQuery(query);
	return `"${normalized.replace(/"/g, '""')}"`;
}

/** Escapes SQLite LIKE wildcards so user input in the fallback matches literally. */
export function escapeLikePattern(input: string): string {
	return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Mirrors the pipeline's name_normalised convention closely enough for the
 * search fallback: upper-cased, punctuation stripped, LIMITED collapsed to
 * LTD (docs/PRD.md section 6.1).
 */
export function normalizeName(input: string): string {
	return normalizeQuery(input)
		.toUpperCase()
		.replace(/[^A-Z0-9 ]/g, '')
		.replace(/\bLIMITED\b/g, 'LTD')
		.replace(/\s+/g, ' ')
		.trim();
}

/** A `%...%` LIKE pattern built from a normalised, escaped query. Bind with `ESCAPE '\'`. */
export function likeFallbackPattern(query: string): string {
	return `%${escapeLikePattern(normalizeName(query))}%`;
}

export function clampLimit(
	requested: number | string | null | undefined,
	{
		fallback = DEFAULT_SEARCH_LIMIT,
		max = MAX_SEARCH_LIMIT
	}: { fallback?: number; max?: number } = {}
): number {
	const parsed = typeof requested === 'string' ? Number.parseInt(requested, 10) : requested;
	if (parsed === null || parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(Math.floor(parsed), max);
}
