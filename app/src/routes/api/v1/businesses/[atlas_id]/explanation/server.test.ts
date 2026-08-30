// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET } from './+server';

const scoreRow = {
	atlas_id: 'atlas-example-1',
	rubric: 'formality',
	version: 1,
	regeneration_id: 'regen-example-1',
	value: 25,
	max: 100,
	checkable: 55,
	unknown: 45,
	coverage: JSON.stringify({ applicable: 3, checked: 1, found_in: 1, not_yet_checked: 2 }),
	evidence: JSON.stringify([
		{
			predicate: 'trading_licence',
			points: 25,
			statement_ids: ['statement-example-1'],
			as_of: '2026-08-01'
		}
	]),
	evaluation_as_of: '2026-08-29T09:05:00Z'
};

function db(kind: 'main' | 'statements' | 'scores'): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('SELECT 1 AS ok')) return { ok: 1 };
					if (kind === 'scores' && sql.includes('FROM scores')) return scoreRow;
					return null;
				},
				all: async () => ({ results: kind === 'statements' ? [statementRow] : [] })
			})
		})
	} as unknown as D1Database;
}

const statementRow = {
	statement_id: 'statement-example-1',
	atlas_id: 'atlas-example-1',
	country: 'UG',
	field: 'status.licence',
	value: 'Current',
	source: 'example.register',
	source_ref: 'https://example.invalid/records/1',
	source_record_id: 'record-example-1',
	asserted_at: '2026-08-01T00:00:00Z',
	licence: 'CC-BY-4.0',
	precedence: 3,
	confidence: 'official'
};

describe('score explanation API', () => {
	it('builds the explanation from joined evidence', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example-1/explanation?rubric=formality'
		);
		const response = await GET({
			platform: {
				env: {
					DB: db('main'),
					DB_STATEMENTS: db('statements'),
					DB_SCORES: db('scores')
				}
			},
			params: { atlas_id: 'atlas-example-1' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			atlas_id: 'atlas-example-1',
			rubric: 'formality',
			explanation:
				'Trading licence earned 25 points from example.register dated 2026-08-01. 55 points were checkable and 45 were unknown; scores are not a credit or fraud verdict.'
		});
	});
});
