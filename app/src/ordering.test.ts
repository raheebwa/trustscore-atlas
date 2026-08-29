import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { rankValues, type RankableStatement } from '$lib/ordering';

interface PrecedenceFixture {
	cases: {
		name: string;
		statements: RankableStatement[];
		ranked: string[];
	}[];
}

describe('rankValues golden contract', () => {
	it('matches every precedence ordering case', async () => {
		const fixtureUrl = new URL('../../schemas/golden/precedence-ordering.json', import.meta.url);
		const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8')) as PrecedenceFixture;

		for (const testCase of fixture.cases) {
			expect(rankValues(testCase.statements), testCase.name).toEqual(testCase.ranked);
		}
	});

	it('treats invalid asserted timestamps as older than valid timestamps', () => {
		expect(
			rankValues([
				{
					value: 'Example Invalid Date Traders',
					precedence: 3,
					source_record_id: 'invalid-date',
					asserted_at: 'not-a-date'
				},
				{
					value: 'Sample Valid Date Traders',
					precedence: 3,
					source_record_id: 'valid-date',
					asserted_at: '2026-08-28T22:00:00Z'
				}
			])
		).toEqual(['Sample Valid Date Traders', 'Example Invalid Date Traders']);
	});
});
