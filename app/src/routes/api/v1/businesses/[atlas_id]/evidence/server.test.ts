import { describe, expect, it } from 'vitest';
import { GET } from './+server';

const statementRow = {
	statement_id: 'statement-example-1',
	atlas_id: 'atlas-example-1',
	country: 'UG',
	field: 'canonical_name',
	value: 'Example Hardware Supplies Ltd',
	source: 'example.register',
	source_ref: 'https://example.invalid/records/1',
	source_record_id: 'record-example-1',
	asserted_at: '2026-08-01T00:00:00Z',
	licence: 'CC-BY-4.0',
	precedence: 3,
	confidence: 'official'
};

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

function mainDb(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('SELECT 1 AS ok')) return { ok: 1 };
					if (sql.includes('FROM scores')) return scoreRow;
					return null;
				}
			})
		})
	} as unknown as D1Database;
}

function statementsDb(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					return null;
				},
				all: async () => {
					if (sql.includes('field = ?')) expect(bindings).toContain('canonical_name');
					return { results: [statementRow] };
				}
			})
		})
	} as unknown as D1Database;
}

describe('evidence API', () => {
	it('returns a paged compact field trace', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example-1/evidence?field=canonical_name'
		);
		const response = await GET({
			platform: { env: { DB: mainDb(), DB_STATEMENTS: statementsDb() } },
			params: { atlas_id: 'atlas-example-1' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			atlas_id: 'atlas-example-1',
			mode: 'field',
			field: 'canonical_name',
			returned: 1,
			statements: [
				{
					source: 'example.register',
					source_ref: 'https://example.invalid/records/1',
					asserted_at: '2026-08-01T00:00:00Z',
					precedence: 3,
					value: 'Example Hardware Supplies Ltd'
				}
			]
		});
	});

	it('joins rubric evidence to its register statements', async () => {
		const request = new Request(
			'https://atlas.example.invalid/api/v1/businesses/atlas-example-1/evidence?rubric=formality'
		);
		const response = await GET({
			platform: { env: { DB: mainDb(), DB_STATEMENTS: statementsDb() } },
			params: { atlas_id: 'atlas-example-1' },
			request,
			url: new URL(request.url)
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			mode: 'rubric',
			rubric: 'formality',
			evidence: [
				{
					predicate: 'trading_licence',
					points: 25,
					statements: [{ source: 'example.register', value: 'Example Hardware Supplies Ltd' }]
				}
			]
		});
	});
});
