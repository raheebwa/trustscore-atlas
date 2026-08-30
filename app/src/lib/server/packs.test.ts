// SPDX-License-Identifier: Apache-2.0
/**
 * The header's country switch is the one place a visitor changes what every page is about, so the
 * list behind it comes from the data rather than from a hardcoded list of countries.
 */

import { describe, expect, it } from 'vitest';
import { listPacks, listPacksCached, resolveScopeCountry } from './packs';
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

/**
 * A record is addressed by its atlas_id and belongs to exactly one pack, so the record decides the
 * country on its own pages. Everywhere else the header switch is the authority.
 */
function fakeRecordDatabases(country: string | null): AtlasDatabases {
	const base = fakeDatabases();
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () =>
					sql.includes('FROM businesses')
						? country
							? { country }
							: null
						: base.db
								.prepare(sql)
								.bind(bindings[0] as string)
								.first(),
				all: async () => base.db.prepare(sql).bind().all()
			})
		})
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

describe('resolveScopeCountry', () => {
	it.each([
		['/b/atl_example', 'UG', 'KE'],
		['/b/atl_example/trace/canonical_name', 'UG', 'KE'],
		['/claim/atl_example', 'KE', 'UG']
	])('scopes %s to the record rather than to the switch', async (pathname, record, asked) => {
		const scope = await resolveScopeCountry(fakeRecordDatabases(record), undefined, {
			pathname,
			requested: asked,
			remembered: asked
		});

		expect(scope).toEqual({ country: record, fromRecord: true });
	});

	it('keeps the switch on a record that is not there to disagree', async () => {
		const scope = await resolveScopeCountry(fakeRecordDatabases(null), undefined, {
			pathname: '/b/atl_missing',
			requested: 'KE',
			remembered: null
		});

		expect(scope).toEqual({ country: 'KE', fromRecord: false });
	});

	it('ignores a country a record claims that no pack publishes', async () => {
		const scope = await resolveScopeCountry(fakeRecordDatabases('ZZ'), undefined, {
			pathname: '/b/atl_example',
			requested: 'KE',
			remembered: null
		});

		expect(scope).toEqual({ country: 'KE', fromRecord: false });
	});

	it.each(['/search', '/explore', '/sources', '/downloads', '/'])(
		'keeps the switch as the authority on %s',
		async (pathname) => {
			const scope = await resolveScopeCountry(fakeRecordDatabases('UG'), undefined, {
				pathname,
				requested: 'KE',
				remembered: null
			});

			expect(scope).toEqual({ country: 'KE', fromRecord: false });
		}
	);
});
