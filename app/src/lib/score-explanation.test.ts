import { describe, expect, it } from 'vitest';
import { explainScore } from './score-explanation';

describe('explainScore', () => {
	it('writes one evidence sentence per predicate and the required closing sentence', () => {
		const explanation = explainScore({
			rubric: 'formality',
			checkable: 55,
			unknown: 45,
			evidence: [
				{
					predicate: 'trading_licence',
					points: 25,
					as_of: '2026-08-01',
					statement_ids: ['statement-example-1'],
					statements: [
						{
							source: 'example.register',
							source_ref: 'https://example.invalid/records/1',
							asserted_at: '2026-08-01T00:00:00Z',
							precedence: 3,
							value: 'Example licence row'
						}
					]
				},
				{
					predicate: 'legal_register_presence',
					points: 0,
					reason: 'The register was not checked.',
					statements: []
				}
			]
		});

		expect(explanation).toBe(
			'Trading licence earned 25 points from example.register dated 2026-08-01. Legal register presence earned no points because the register was not checked. 55 points were checkable and 45 were unknown; scores are not a credit or fraud verdict.'
		);
	});
});
