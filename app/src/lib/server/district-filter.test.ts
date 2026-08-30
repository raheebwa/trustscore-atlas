// SPDX-License-Identifier: Apache-2.0
/**
 * A district filter naming a place the data does not carry used to answer with an empty page and
 * no reason, for a person and for a model alike. It now says so and names what the data holds.
 */

import { describe, expect, it } from 'vitest';
import { checkDistrictFilter } from './district-filter';
import type { AtlasDatabases } from './platform';

function fakeDatabases(): AtlasDatabases {
	const db = {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => ({ value: 'regen-1' }),
				all: async () => ({
					results: sql.includes('GROUP BY district')
						? [
								{ key: 'KAMPALA', count: 59861 },
								{ key: 'WAKISO', count: 1587 }
							]
						: sql.includes('GROUP BY division')
							? [{ key: 'Central Division', count: 26291 }]
							: []
				})
			})
		})
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('checkDistrictFilter', () => {
	it('accepts a district the data carries, whatever its case', async () => {
		const result = await checkDistrictFilter(fakeDatabases(), 'UG', 'kampala');
		expect(result.known).toBe(true);
		expect(result.suggestions).toEqual([]);
	});

	it('accepts a division too, since the filter matches either', async () => {
		expect((await checkDistrictFilter(fakeDatabases(), 'UG', 'Central Division')).known).toBe(true);
	});

	it('refuses an unknown district and names the nearest values the data holds', async () => {
		const result = await checkDistrictFilter(fakeDatabases(), 'UG', 'Kampala District');
		expect(result.known).toBe(false);
		expect(result.suggestions).toContain('KAMPALA');
	});

	it('has nothing to check when no district was asked for', async () => {
		expect(await checkDistrictFilter(fakeDatabases(), 'UG', '')).toEqual({
			known: true,
			suggestions: []
		});
	});
});
