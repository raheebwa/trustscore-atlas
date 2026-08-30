import { describe, expect, it } from 'vitest';
import { groupStatements } from './trace';
import type { StatementRow } from './types';

function row(id: string, overrides: Partial<StatementRow> = {}): StatementRow {
	return {
		statement_id: id,
		atlas_id: 'atlas-1',
		country: 'UG',
		field: 'canonical_name',
		value: 'EXAMPLE LIMITED',
		source: 'ura.customs_agents',
		source_ref: 'https://example.invalid/customs',
		source_record_id: `rec-${id}`,
		asserted_at: '2026-05-12T00:00:00Z',
		licence: 'public-record',
		precedence: 2,
		confidence: 'official',
		...overrides
	};
}

describe('groupStatements', () => {
	it('folds identical value, source, date and precedence into one row with a count', () => {
		const rows = [
			row('s1'),
			row('s2'),
			row('s3'),
			row('s4', { source: 'unbs.certified_products', value: 'Example limited', precedence: 3 })
		];
		const groups = groupStatements(rows, 's2');
		expect(groups.map((g) => [g.statement.value, g.count, g.isWinner])).toEqual([
			['EXAMPLE LIMITED', 3, true],
			['Example limited', 1, false]
		]);
		expect(groups[0].statement.statement_id).toBe('s2');
		expect(groups[0].records.map((r) => r.source_record_id)).toEqual([
			'rec-s1',
			'rec-s2',
			'rec-s3'
		]);
	});

	it('keeps different dates and sources apart and preserves first-seen order', () => {
		const rows = [
			row('a', { asserted_at: '2026-01-01T00:00:00Z' }),
			row('b'),
			row('c', { source: 'ura.vat_withholding_agents' })
		];
		const groups = groupStatements(rows, null);
		expect(groups).toHaveLength(3);
		expect(groups.every((g) => g.count === 1 && !g.isWinner)).toBe(true);
	});
});
