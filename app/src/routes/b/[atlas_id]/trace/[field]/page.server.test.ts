// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { StatementRow } from '$lib/types';
import { STATEMENTS_MAX_ROWS } from '$lib/pagination';
import { load } from './+page.server';

function traceStatement(index: number): StatementRow {
	return {
		statement_id: `trace-${index}`,
		atlas_id: 'a',
		country: 'UG',
		field: 'canonical_name',
		value: `Example ${index}`,
		source: 'r',
		source_ref: 'https://example.invalid',
		source_record_id: `r-${index}`,
		asserted_at: '2026-08-29T00:00:00Z',
		licence: 'open',
		precedence: 3,
		confidence: 'listed'
	};
}

function mainDb(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					return { ok: 1 };
				}
			})
		})
	} as unknown as D1Database;
}

function statementsDb(rows: StatementRow[], statementSql: string[]): D1Database {
	return {
		prepare: (sql: string) => {
			if (sql.includes('FROM statements')) statementSql.push(sql);
			return {
				bind: () => ({
					first: async () => {
						if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
						return { ok: 1 };
					},
					all: async () => ({ results: rows })
				})
			};
		}
	} as unknown as D1Database;
}

describe('trace page loader', () => {
	it('returns a bounded first page and a continuation when more rows exist', async () => {
		const statementSql: string[] = [];
		const db = mainDb();
		const statements = statementsDb(
			Array.from({ length: STATEMENTS_MAX_ROWS + 1 }, (_, index) => traceStatement(index)),
			statementSql
		);

		const data = await load({
			platform: { env: { DB: db, DB_STATEMENTS: statements, DB_SCORES: db } },
			params: { atlas_id: 'atlas-example', field: 'canonical_name' },
			url: new URL('https://atlas.example.invalid/b/atlas-example/trace/canonical_name')
		} as never);
		if (!data) throw new Error('Expected trace page data');

		expect(data.trace.statements).toHaveLength(STATEMENTS_MAX_ROWS);
		expect(data.trace.next_cursor).toEqual(expect.any(String));
		expect(statementSql).toHaveLength(1);
		expect(statementSql[0]).toMatch(/LIMIT \? OFFSET \?/);
	});
});
