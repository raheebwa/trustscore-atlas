// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { listRegenerations, OpsError, requestRegeneration } from './regeneration-requests';

function fakeDb(options: { ids?: string[]; pending?: number } = {}) {
	const calls: { sql: string; bindings: unknown[] }[] = [];
	const ids = options.ids ?? ['20260830T035950Z', '20260830T031131Z', '20260830T030202Z'];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const call = { sql, bindings };
				return {
					all: async () => {
						calls.push(call);
						if (sql.includes('FROM regenerations')) {
							return {
								results: ids.map((id, i) => ({
									id,
									finished_at: `2026-08-30T0${i}:00:00Z`,
									status: i === 0 ? 'live' : 'superseded'
								}))
							};
						}
						if (sql.includes('FROM regeneration_requests')) return { results: [] };
						return { results: [] };
					},
					first: async () => {
						calls.push(call);
						if (sql.includes('FROM meta')) return { value: ids[0] };
						if (sql.includes('pending')) return { n: options.pending ?? 0 };
						return null;
					},
					run: async () => {
						calls.push(call);
						return { success: true };
					}
				};
			}
		}),
		batch: async (statements: unknown[]) => {
			calls.push({ sql: 'BATCH', bindings: statements });
			return [];
		}
	} as unknown as D1Database;
	return { db, calls };
}

describe('listRegenerations', () => {
	it('returns the live id first with the earlier ids as rollback targets', async () => {
		const { db } = fakeDb();
		const list = await listRegenerations(db);
		expect(list.live).toBe('20260830T035950Z');
		expect(list.targets.map((r) => r.id)).toEqual(['20260830T031131Z', '20260830T030202Z']);
	});
});

describe('requestRegeneration', () => {
	it('appends a regenerate request with a pending event', async () => {
		const { db, calls } = fakeDb();
		const request = await requestRegeneration(db, {
			kind: 'regenerate',
			target_id: null,
			reason: 'PPDA export is back.',
			requested_by: 'm@lvh.me'
		});
		expect(request.request_id).toMatch(/^rreq_/);
		const batch = calls.find((c) => c.sql === 'BATCH');
		expect(batch).toBeDefined();
		expect((batch?.bindings as unknown[]).length).toBe(2);
	});

	it('accepts a rollback only to a known earlier regeneration and refuses duplicates and empty reasons', async () => {
		await expect(
			requestRegeneration(fakeDb().db, {
				kind: 'rollback',
				target_id: '20260830T031131Z',
				reason: 'Bad KCCA pull.',
				requested_by: 'm@lvh.me'
			})
		).resolves.toMatchObject({ kind: 'rollback', target_id: '20260830T031131Z' });
		await expect(
			requestRegeneration(fakeDb().db, {
				kind: 'rollback',
				target_id: '20260830T035950Z',
				reason: 'x',
				requested_by: 'm@lvh.me'
			})
		).rejects.toBeInstanceOf(OpsError);
		await expect(
			requestRegeneration(fakeDb().db, {
				kind: 'rollback',
				target_id: '20250101T000000Z',
				reason: 'x',
				requested_by: 'm@lvh.me'
			})
		).rejects.toBeInstanceOf(OpsError);
		await expect(
			requestRegeneration(fakeDb().db, {
				kind: 'regenerate',
				target_id: null,
				reason: '  ',
				requested_by: 'm@lvh.me'
			})
		).rejects.toBeInstanceOf(OpsError);
		await expect(
			requestRegeneration(fakeDb({ pending: 1 }).db, {
				kind: 'regenerate',
				target_id: null,
				reason: 'again',
				requested_by: 'm@lvh.me'
			})
		).rejects.toBeInstanceOf(OpsError);
	});
});

describe('rollback bucket guard', () => {
	it('refuses a rollback whose load SQL or bundle is missing from the bucket', async () => {
		const { requestRegeneration: request, rollbackKeys } = await import('./regeneration-requests');
		const present = new Set(['bundles/20260830T031131Z/manifest.json']);
		const bucket = {
			head: async (key: string) => (present.has(key) ? { key } : null)
		} as unknown as R2Bucket;
		const input = {
			kind: 'rollback' as const,
			target_id: '20260830T031131Z',
			reason: 'x',
			requested_by: 'm@lvh.me'
		};
		await expect(request(fakeDb().db, input, bucket)).rejects.toThrow(
			/regen\/20260830T031131Z\/swap\.sql/
		);
		for (const key of rollbackKeys('20260830T031131Z')) present.add(key);
		await expect(request(fakeDb().db, input, bucket)).resolves.toMatchObject({ kind: 'rollback' });
	});
});
