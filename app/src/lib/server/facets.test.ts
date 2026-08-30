/**
 * Facets feed the search filters, so every value they offer must exist in the data: a filter
 * control built from a free-text guess sends people to empty result pages.
 */

import { describe, expect, it } from 'vitest';
import { RegenerationInProgressError } from './atlas';
import { listFacets, listFacetsCached } from './facets';
import type { AtlasDatabases } from './platform';

function fakeDatabases(calls: string[], liveIds = ['regen-example-1']): AtlasDatabases {
	let metaReads = 0;
	const rowsFor = (sql: string) => {
		if (sql.includes('GROUP BY district')) {
			return [
				{ key: 'Kampala', count: 3 },
				{ key: null, count: 1 }
			];
		}
		if (sql.includes('GROUP BY division')) return [{ key: 'Central Division', count: 3 }];
		if (sql.includes('GROUP BY register')) return [{ key: 'kcca.businesses', count: 4 }];
		if (sql.includes('GROUP BY sector_nature')) return [{ key: 'Wholesalers', count: 2 }];
		if (sql.includes('GROUP BY sector_category')) return [{ key: 'GENERAL', count: 4 }];
		return [];
	};
	const db = {
		prepare: (sql: string) => {
			calls.push(sql);
			return {
				bind: (...bindings: unknown[]) => {
					calls.push(`bindings:${JSON.stringify(bindings)}`);
					return {
						first: async () => {
							const value = liveIds[Math.min(metaReads, liveIds.length - 1)];
							metaReads += 1;
							return { value };
						},
						all: async () => ({ results: rowsFor(sql) })
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('listFacets', () => {
	it('offers one value set per filter, counted from the segments table', async () => {
		const calls: string[] = [];
		const response = await listFacets(fakeDatabases(calls), 'ug');

		expect(response.country).toBe('UG');
		expect(response.regeneration_id).toBe('regen-example-1');
		expect(response.facets.district).toEqual([{ value: 'Kampala', count: 3 }]);
		expect(response.facets.division).toEqual([{ value: 'Central Division', count: 3 }]);
		expect(response.facets.sector_category).toEqual([{ value: 'GENERAL', count: 4 }]);
		expect(response.facets.sector_nature).toEqual([{ value: 'Wholesalers', count: 2 }]);
		expect(response.facets.register).toEqual([{ value: 'kcca.businesses', count: 4 }]);
	});

	it('counts each business once by reading the rollup rows for the dimensions it is not grouping', async () => {
		const calls: string[] = [];
		await listFacets(fakeDatabases(calls), 'KE');

		const districtQuery = calls.find((sql) => sql.includes('GROUP BY district'));
		expect(districtQuery).toContain('sector_nature IS NULL');
		expect(districtQuery).toContain('register IS NULL');
		const natureQuery = calls.find((sql) => sql.includes('GROUP BY sector_nature'));
		expect(natureQuery).toContain('sector_nature IS NOT NULL');
		const registerQuery = calls.find((sql) => sql.includes('GROUP BY register'));
		expect(registerQuery).toContain('register IS NOT NULL');
		expect(calls).toContain('bindings:["KE"]');
	});

	it('refuses to mix two regenerations when a swap lands mid-read', async () => {
		const calls: string[] = [];
		await expect(
			listFacets(fakeDatabases(calls, ['regen-example-1', 'regen-example-2']), 'UG')
		).rejects.toBeInstanceOf(RegenerationInProgressError);
	});
});

describe('listFacetsCached', () => {
	it('answers from the cache and stores under the regeneration, deployment and country', async () => {
		const store = new Map<string, string>();
		const cache = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => void store.set(key, value)
		} as unknown as KVNamespace;

		const first = await listFacetsCached(fakeDatabases([]), cache, 'UG', 'deploy-1');
		const [key] = [...store.keys()];
		expect(key).toContain('facets:');
		expect(key).toContain('regen-example-1');
		expect(key).toContain('deploy-1');
		expect(key.endsWith(':UG')).toBe(true);

		store.set(key, JSON.stringify({ ...first, country: 'CACHED' }));
		const second = await listFacetsCached(fakeDatabases([]), cache, 'UG', 'deploy-1');
		expect(second.country).toBe('CACHED');
	});
});
