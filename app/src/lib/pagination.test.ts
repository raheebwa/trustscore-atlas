// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { buildStatementsPage } from '$lib/server/atlas';
import type { StatementRow } from '$lib/types';
import {
	CURSOR_MAX_OFFSET,
	InvalidCursorError,
	buildSearchCursor,
	decodeCursor,
	encodeCursor,
	jsonByteLength,
	searchCursorContext,
	statementCursorContext
} from './pagination';

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
	const searchContext = searchCursorContext('  Example   Hardware ', ' Kampala ');

	it('round trips an offset for the expected cursor scope', () => {
		const cursor = encodeCursor('search', 40, searchContext, 'regen-example-2');
		expect(cursor).not.toContain('40');
		expect(decodeCursor(cursor, 'search', searchContext, 'regen-example-2')).toBe(40);
	});

	it('rejects a search cursor reused with another query', () => {
		const cursor = buildSearchCursor(20, 'Example Hardware', 'Kampala', 'regen-example-2');

		expect(() =>
			decodeCursor(
				cursor,
				'search',
				searchCursorContext('Sample Bakery', 'Kampala'),
				'regen-example-2'
			)
		).toThrow(InvalidCursorError);
	});

	it('rejects a cursor from a previous live regeneration', () => {
		const cursor = buildSearchCursor(20, 'Example Hardware', 'Kampala', 'regen-example-1');

		expect(() => decodeCursor(cursor, 'search', searchContext, 'regen-example-2')).toThrow(
			InvalidCursorError
		);
	});

	it('rejects malformed, mismatched, and out-of-range offsets', () => {
		expect(() => decodeCursor('not-valid!', 'search', searchContext, 'regen-example-2')).toThrow(
			InvalidCursorError
		);
		expect(() =>
			decodeCursor(
				encodeCursor(
					'statements',
					20,
					statementCursorContext('atlas-example', null),
					'regen-example-2'
				),
				'search',
				searchContext,
				'regen-example-2'
			)
		).toThrow(InvalidCursorError);
		expect(() => encodeCursor('search', -1, searchContext, 'regen-example-2')).toThrow(
			InvalidCursorError
		);
		expect(() =>
			encodeCursor('search', CURSOR_MAX_OFFSET + 1, searchContext, 'regen-example-2')
		).toThrow(InvalidCursorError);
	});
});

describe('statement byte budget', () => {
	it('returns only whole rows that fit and advances by the returned row count', () => {
		const byteBudget = 1_600;
		const context = statementCursorContext('ug-example', null);
		const page = buildStatementsPage(
			Array.from({ length: 20 }, (_, index) => statement(index)),
			{
				atlasId: 'ug-example',
				field: null,
				offset: 10,
				limit: 20,
				hasMore: false,
				cursorKind: 'statements',
				cursorContext: context,
				regenerationId: 'regen-example-2',
				byteBudget
			}
		);

		expect(page.returned).toBeGreaterThan(0);
		expect(page.returned).toBeLessThan(20);
		expect(jsonByteLength(page)).toBeLessThanOrEqual(byteBudget);
		expect(page.next_cursor).not.toBeNull();
		expect(decodeCursor(page.next_cursor, 'statements', context, 'regen-example-2')).toBe(
			10 + page.returned
		);
	});

	it('advances past filtered rows instead of repeating a visible statement', () => {
		const context = statementCursorContext('ug-example', null);
		const rows = [
			statement(1),
			{ ...statement(2), value: 'records@example.invalid' },
			statement(3)
		];
		const page = buildStatementsPage(rows, {
			atlasId: 'ug-example',
			field: null,
			offset: 10,
			limit: 3,
			hasMore: true,
			cursorKind: 'statements',
			cursorContext: context,
			regenerationId: 'regen-example-2'
		});

		expect(page.statements.map((row) => row.statement_id)).toEqual(['statement-1', 'statement-3']);
		expect(decodeCursor(page.next_cursor, 'statements', context, 'regen-example-2')).toBe(13);
	});
});
