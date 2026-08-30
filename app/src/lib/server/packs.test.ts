/**
 * The header's country switch is the one place a visitor changes what every page is about, so the
 * list behind it comes from the data rather than from a hardcoded list of countries.
 */

import { describe, expect, it } from 'vitest';
import { listPacks, listPacksCached } from './packs';
import type { AtlasDatabases } from './platform';

function fakeDatabases(published: unknown = undefined): AtlasDatabases {
	const methodology =
		published === undefined
			? JSON.stringify({
					rubrics: [],
					packs: { UG: { name: 'Uganda', precedence: {}, bindings: {} }, KE: {} },
					linkage: { candidate_threshold: 0.8, review_band: [0.8, 0.95] }
				})
			: (published as string | null);
	const db = {
		prepare: (sql: string) => ({
			bind: (key?: string) => ({
				// The meta table answers by key: the live pointer for one caller, the published
				// methodology for the other.
				first: async () =>
					sql.includes('FROM meta')
						? { value: key === 'live_regeneration' ? 'regen-1' : methodology }
						: null,
				all: async () => ({
					results: [
						{ country: 'UG', businesses: 79017 },
						{ country: 'KE', businesses: 61 }
					]
				})
			})
		})
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('listPacks', () => {
	it('lists a loaded pack per country, named from the published methodology, biggest first', async () => {
		const packs = await listPacks(fakeDatabases());

		expect(packs).toEqual([
			{ code: 'UG', name: 'Uganda', businesses: 79017 },
			{ code: 'KE', name: 'Kenya', businesses: 61 }
		]);
	});

	it('falls back to the country name when a pack publishes none', async () => {
		const packs = await listPacks(fakeDatabases(null));

		expect(packs.map((pack) => pack.name)).toEqual(['Uganda', 'Kenya']);
	});
});

describe('listPacksCached', () => {
	it('stores one entry per regeneration and deployment', async () => {
		const store = new Map<string, string>();
		const cache = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => void store.set(key, value)
		} as unknown as KVNamespace;

		await listPacksCached(fakeDatabases(), cache, 'deploy-1');
		const [key] = [...store.keys()];
		expect(key).toContain('packs:');
		expect(key).toContain('deploy-1');

		store.set(key, JSON.stringify([{ code: 'ZZ', name: 'Cached', businesses: 1 }]));
		const second = await listPacksCached(fakeDatabases(), cache, 'deploy-1');
		expect(second[0].code).toBe('ZZ');
	});
});
