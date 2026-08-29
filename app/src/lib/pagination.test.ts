import { describe, expect, it } from 'vitest';
import { buildStatementsPage } from '$lib/server/atlas';
import type { StatementRow } from '$lib/types';
import { InvalidCursorError, decodeCursor, encodeCursor, jsonByteLength } from './pagination';

function statement(index: number): StatementRow {
	return {
		statement_id: `statement-${index}`,
		atlas_id: 'ug-example',
		country: 'UG',
		field: 'canonical_name',
		value: `Example Hardware Supplies Ltd ${'Kampala '.repeat(12)}${index}`,
		source: 'example.register',
		source_ref: `https://example.org/records/${index}`,
		source_record_id: `record-${index}`,
		asserted_at: '2026-08-29T00:00:00Z',
		licence: 'CC-BY-4.0',
		precedence: 3,
		confidence: 'official'
	};
}

describe('cursor encoding', () => {
	it('round trips an offset for the expected cursor kind', () => {
		const cursor = encodeCursor('search', 40);
		expect(cursor).not.toContain('40');
		expect(decodeCursor(cursor, 'search')).toBe(40);
	});

	it('rejects malformed, mismatched, and invalid offsets', () => {
		expect(() => decodeCursor('not-valid!', 'search')).toThrow(InvalidCursorError);
		expect(() => decodeCursor(encodeCursor('statements', 20), 'search')).toThrow(
			InvalidCursorError
		);
		expect(() => encodeCursor('search', -1)).toThrow(InvalidCursorError);
	});
});

describe('statement byte budget', () => {
	it('returns only whole rows that fit and advances by the returned row count', () => {
		const byteBudget = 1_600;
		const page = buildStatementsPage(
			Array.from({ length: 20 }, (_, index) => statement(index)),
			{
				atlasId: 'ug-example',
				field: null,
				offset: 10,
				limit: 20,
				hasMore: false,
				byteBudget
			}
		);

		expect(page.returned).toBeGreaterThan(0);
		expect(page.returned).toBeLessThan(20);
		expect(jsonByteLength(page)).toBeLessThanOrEqual(byteBudget);
		expect(page.next_cursor).not.toBeNull();
		expect(decodeCursor(page.next_cursor, 'statements')).toBe(10 + page.returned);
	});
});
