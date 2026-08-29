import { describe, expect, it } from 'vitest';
import { buildSegmentFilter } from './segments';

describe('buildSegmentFilter', () => {
	it('keeps every filter in bindings and matches register coverage with json_each', () => {
		const filter = buildSegmentFilter({
			category: 'Trade',
			nature: 'Hardware',
			district: 'Example District',
			division: 'Central Division',
			present_in: 'example.register'
		});

		expect(filter.whereClause).toContain('b.sector_category = ? COLLATE NOCASE');
		expect(filter.whereClause).toContain("json_each(b.coverage, '$.found_in')");
		expect(filter.whereClause).not.toContain('Trade');
		expect(filter.whereClause).not.toContain('example.register');
		expect(filter.bindings).toEqual([
			'Trade',
			'Hardware',
			'Example District',
			'Central Division',
			'example.register'
		]);
	});

	it('returns an empty WHERE clause when no filters are supplied', () => {
		expect(buildSegmentFilter({})).toEqual({ whereClause: '', bindings: [] });
	});
});
