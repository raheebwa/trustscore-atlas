import { describe, expect, it } from 'vitest';
import { formatExecutionResult, normaliseInputSchema, valuesToArguments } from './browser';

describe('browser action forms', () => {
	it('accepts the JSON-string schema returned by Chrome', () => {
		expect(
			normaliseInputSchema(
				JSON.stringify({
					type: 'object',
					properties: { query: { type: 'string', description: 'Example search text.' } },
					required: ['query']
				})
			)
		).toEqual({
			type: 'object',
			properties: { query: { type: 'string', description: 'Example search text.' } },
			required: ['query']
		});
	});

	it('converts form values into typed arguments and omits blank optional values', () => {
		const schema = normaliseInputSchema({
			type: 'object',
			properties: {
				query: { type: 'string' },
				limit: { type: 'number' },
				district: { type: 'string' },
				include_closed: { type: 'boolean' }
			},
			required: ['query']
		});

		expect(
			valuesToArguments(schema, {
				query: 'Example Workshop',
				limit: '4',
				district: '',
				include_closed: true
			})
		).toEqual({ query: 'Example Workshop', limit: 4, include_closed: true });
	});

	it('formats the JSON string returned by Chrome', () => {
		expect(formatExecutionResult('{"status":"confirmed","issue_id":"issue_example_1"}')).toBe(
			'{\n  "status": "confirmed",\n  "issue_id": "issue_example_1"\n}'
		);
	});
});
