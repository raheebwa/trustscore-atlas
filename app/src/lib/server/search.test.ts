import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SEARCH_LIMIT,
	MAX_SEARCH_LIMIT,
	clampLimit,
	escapeFtsPhrase,
	escapeLikePattern,
	likeFallbackPattern,
	normalizeName,
	normalizeQuery,
	shouldUseFts
} from './search';

describe('normalizeQuery', () => {
	it('trims and collapses internal whitespace', () => {
		expect(normalizeQuery('  Example   Hardware  ')).toBe('Example Hardware');
	});
});

describe('shouldUseFts', () => {
	it('is false for empty or short queries', () => {
		expect(shouldUseFts('')).toBe(false);
		expect(shouldUseFts('a')).toBe(false);
		expect(shouldUseFts('ab')).toBe(false);
	});

	it('is true once the trimmed query reaches three characters', () => {
		expect(shouldUseFts('abc')).toBe(true);
		expect(shouldUseFts('  exa ')).toBe(true);
	});
});

describe('escapeFtsPhrase', () => {
	it('wraps the query in a quoted FTS phrase', () => {
		expect(escapeFtsPhrase('example hardware')).toBe('"example hardware"');
	});

	it('doubles internal double quotes so the phrase stays literal', () => {
		expect(escapeFtsPhrase('sample "bakery"')).toBe('"sample ""bakery"""');
	});

	it('never leaves FTS operators unquoted, defeating query-syntax injection', () => {
		const malicious = 'a OR name_variants:*';
		const escaped = escapeFtsPhrase(malicious);
		expect(escaped.startsWith('"')).toBe(true);
		expect(escaped.endsWith('"')).toBe(true);
		expect(escaped).toBe('"a OR name_variants:*"');
	});
});

describe('escapeLikePattern', () => {
	it('escapes percent, underscore and backslash', () => {
		expect(escapeLikePattern('50%_off\\deal')).toBe('50\\%\\_off\\\\deal');
	});

	it('leaves ordinary characters untouched', () => {
		expect(escapeLikePattern('Sample Bakery')).toBe('Sample Bakery');
	});
});

describe('normalizeName', () => {
	it('upper-cases, strips punctuation, and collapses LIMITED to LTD', () => {
		expect(normalizeName('Example Hardware Supplies Limited')).toBe(
			'EXAMPLE HARDWARE SUPPLIES LTD'
		);
	});

	it('strips punctuation such as commas and periods', () => {
		expect(normalizeName('Sample Bakery, Ltd.')).toBe('SAMPLE BAKERY LTD');
	});
});

describe('likeFallbackPattern', () => {
	it('produces a normalised, wildcard-wrapped, LIKE-safe pattern', () => {
		expect(likeFallbackPattern('sample')).toBe('%SAMPLE%');
	});

	it('strips LIKE metacharacters via name normalisation before wrapping', () => {
		// normalizeName strips punctuation (including % and _), so the fallback
		// pattern can never smuggle a wildcard through; escapeLikePattern (tested
		// above) is the defence-in-depth layer if that ever changes.
		expect(likeFallbackPattern('50%')).toBe('%50%');
	});
});

describe('clampLimit', () => {
	it('returns the default when nothing is requested', () => {
		expect(clampLimit(undefined)).toBe(DEFAULT_SEARCH_LIMIT);
		expect(clampLimit(null)).toBe(DEFAULT_SEARCH_LIMIT);
		expect(clampLimit('')).toBe(DEFAULT_SEARCH_LIMIT);
	});

	it('returns the default for non-numeric or non-positive input', () => {
		expect(clampLimit('not-a-number')).toBe(DEFAULT_SEARCH_LIMIT);
		expect(clampLimit(0)).toBe(DEFAULT_SEARCH_LIMIT);
		expect(clampLimit(-5)).toBe(DEFAULT_SEARCH_LIMIT);
	});

	it('parses numeric strings from query parameters', () => {
		expect(clampLimit('5')).toBe(5);
	});

	it('caps at the maximum regardless of what is requested', () => {
		expect(clampLimit(500)).toBe(MAX_SEARCH_LIMIT);
		expect(clampLimit(1000, { max: 50 })).toBe(50);
	});

	it('floors fractional input', () => {
		expect(clampLimit(5.9)).toBe(5);
	});
});

describe('searchBusinessesCached', () => {
	it('answers a repeated query from KV within one regeneration and keys on every option', async () => {
		const { searchBusinessesCached } = await import('./search-cache');
		const store = new Map<string, string>();
		const cache = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			}
		} as unknown as KVNamespace;
		const db = {
			prepare: () => ({ bind: () => ({ first: async () => ({ value: 'regen-1' }) }) })
		} as unknown as D1Database;
		const databases = { db, statementsDb: db, scoresDb: db };
		let searches = 0;
		const search = async () => {
			searches += 1;
			return { query: 'example', total_count: 1, results: [] } as never;
		};
		const options = { q: ' Example ', district: 'Kampala', limit: '5', cursor: null };
		const first = await searchBusinessesCached(databases, cache, options, search);
		const second = await searchBusinessesCached(databases, cache, options, search);
		expect(second).toEqual(first);
		expect(searches).toBe(1);
		expect([...store.keys()]).toEqual(['search:regen-1:dev:["example","kampala","5",""]']);
		await searchBusinessesCached(databases, cache, { ...options, cursor: 'c1' }, search);
		expect(searches).toBe(2);
	});
});
