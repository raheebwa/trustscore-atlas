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
});
