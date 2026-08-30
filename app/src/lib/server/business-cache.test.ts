import { describe, expect, it } from 'vitest';
import { cachedBusinessDetail } from './business-cache';
import type { AtlasDatabases } from './platform';

function databases(liveId: string | null): AtlasDatabases {
	const db = {
		prepare: () => ({
			bind: () => ({ first: async () => (liveId ? { value: liveId } : null) })
		})
	} as unknown as D1Database;
	return { db, statementsDb: db, scoresDb: db };
}

function kv() {
	const store = new Map<string, string>();
	const cache = {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string) => {
			store.set(key, value);
		}
	} as unknown as KVNamespace;
	return { cache, store };
}

const detail = {
	record: { atlas_id: 'atlas-1', canonical_name: 'Example Ltd' },
	provenance: [],
	fields: []
};

describe('cachedBusinessDetail', () => {
	it('composes once per regeneration and answers later requests from KV', async () => {
		const { cache, store } = kv();
		let composed = 0;
		const compose = async () => {
			composed += 1;
			return detail as never;
		};
		const first = await cachedBusinessDetail(databases('regen-1'), cache, 'atlas-1', compose);
		const second = await cachedBusinessDetail(databases('regen-1'), cache, 'atlas-1', compose);
		expect(first).toEqual(detail);
		expect(second).toEqual(detail);
		expect(composed).toBe(1);
		expect([...store.keys()]).toEqual(['business:regen-1:dev:atlas-1']);
	});

	it('recomposes for a new regeneration and never caches a missing record', async () => {
		const { cache, store } = kv();
		let composed = 0;
		const compose = async () => {
			composed += 1;
			return composed === 1 ? (detail as never) : null;
		};
		await cachedBusinessDetail(databases('regen-1'), cache, 'atlas-1', compose);
		await cachedBusinessDetail(databases('regen-2'), cache, 'atlas-1', compose);
		expect(composed).toBe(2);
		expect(store.has('business:regen-2:dev:atlas-1')).toBe(false);
		expect(await cachedBusinessDetail(databases('regen-2'), cache, 'atlas-1', compose)).toBeNull();
	});

	it('works without a cache or a live pointer', async () => {
		const compose = async () => detail as never;
		expect(await cachedBusinessDetail(databases(null), undefined, 'atlas-1', compose)).toEqual(
			detail
		);
	});
});
