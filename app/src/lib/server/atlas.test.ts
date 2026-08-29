import { describe, expect, it } from 'vitest';
import { buildProvenanceTable } from './atlas';
import type { StatementRow } from '$lib/types';

function statement(overrides: Partial<StatementRow>): StatementRow {
	return {
		statement_id: 's1',
		atlas_id: 'atlas-1',
		country: 'UG',
		field: 'canonical_name',
		value: 'Example Hardware Supplies Ltd',
		source: 'kcca.businesses',
		source_ref: 'https://example.org/kcca/1',
		source_record_id: '1',
		asserted_at: '2026-08-01T00:00:00Z',
		licence: 'CC-BY-4.0',
		precedence: 3,
		confidence: 'official',
		...overrides
	};
}

describe('buildProvenanceTable', () => {
	it('returns one winning row per field, sorted by field name', () => {
		const statements = [
			statement({
				statement_id: 's1',
				field: 'location.district',
				precedence: 3,
				value: 'Kampala'
			}),
			statement({
				statement_id: 's2',
				field: 'canonical_name',
				precedence: 2,
				value: 'Example Hardware Supplies Ltd'
			}),
			statement({
				statement_id: 's3',
				field: 'canonical_name',
				precedence: 4,
				value: 'Example Hardware'
			})
		];
		const table = buildProvenanceTable(statements);
		expect(table.map((r) => r.field)).toEqual(['canonical_name', 'location.district']);
		expect(table[0].value).toBe('Example Hardware Supplies Ltd');
		expect(table[0].precedence).toBe(2);
	});

	it('uses distinct source-record support before recency', () => {
		const table = buildProvenanceTable([
			statement({
				statement_id: 'recent',
				value: 'Example Hardware',
				source_record_id: 'recent-record',
				asserted_at: '2026-08-29T00:00:00Z'
			}),
			statement({
				statement_id: 'supported-1',
				value: 'Example Hardware Supplies Ltd',
				source_record_id: 'support-1',
				asserted_at: '2026-08-01T00:00:00Z'
			}),
			statement({
				statement_id: 'supported-2',
				value: 'Example Hardware Supplies Ltd',
				source_record_id: 'support-2',
				asserted_at: '2026-08-01T00:00:00Z'
			})
		]);

		expect(table[0].value).toBe('Example Hardware Supplies Ltd');
	});
});
