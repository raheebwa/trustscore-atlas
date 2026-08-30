// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { listReviewCandidates, OpsError, recordMaintainerLabel } from './linkage-review';

interface Call {
	sql: string;
	bindings: unknown[];
}

function fakeDb(rows: Record<string, unknown>[] = []) {
	const calls: Call[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const call = { sql, bindings };
				return {
					all: async () => {
						calls.push(call);
						return { results: rows };
					},
					first: async () => {
						calls.push(call);
						return sql.includes('FROM businesses') ? { n: 2 } : null;
					},
					run: async () => {
						calls.push(call);
						return { success: true };
					}
				};
			}
		})
	} as unknown as D1Database;
	return { db, calls };
}

describe('listReviewCandidates', () => {
	it('reads the review band with both businesses side by side, excluding pairs already labelled', async () => {
		const { db, calls } = fakeDb([
			{
				atlas_id_a: 'atlas-1',
				atlas_id_b: 'atlas-2',
				match_probability: 0.91,
				comparison: '{"name_tokens":0.8}',
				name_a: 'EXAMPLE STEEL LIMITED',
				name_b: 'Example Steel Ltd',
				district_a: 'Kampala',
				district_b: 'Kampala',
				sector_a: 'GENERAL',
				sector_b: null,
				found_in_a: '["kcca.businesses"]',
				found_in_b: '["unbs.certified_products"]'
			}
		]);
		const candidates = await listReviewCandidates(db);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({
			atlas_id_a: 'atlas-1',
			atlas_id_b: 'atlas-2',
			match_probability: 0.91,
			a: { name: 'EXAMPLE STEEL LIMITED', found_in: ['kcca.businesses'] },
			b: { name: 'Example Steel Ltd', found_in: ['unbs.certified_products'] }
		});
		const sql = calls[0].sql;
		expect(sql).toContain('match_probability >= ?');
		expect(sql).toContain('match_probability < ?');
		expect(sql).toContain('NOT EXISTS');
		expect(sql).toContain('maintainer_labels');
		expect(calls[0].bindings).toEqual([0.8, 0.95, 50]);
	});
});

describe('recordMaintainerLabel', () => {
	it('appends a verdict with reason and actor and never updates', async () => {
		const { db, calls } = fakeDb();
		const label = await recordMaintainerLabel(db, {
			atlas_id: 'atlas-1',
			candidate_atlas_id: 'atlas-2',
			verdict: 'match',
			reason: 'Same legal name, same district, UNBS permit cites the KCCA address.',
			labelled_by: 'maintainer@lvh.me'
		});
		expect(label.label_id).toMatch(/^mlabel_/);
		const insert = calls.find((call) => call.sql.includes('INSERT INTO maintainer_labels'));
		expect(insert?.bindings).toEqual([
			label.label_id,
			'atlas-1',
			'atlas-2',
			'match',
			'Same legal name, same district, UNBS permit cites the KCCA address.',
			'maintainer@lvh.me',
			label.labelled_at
		]);
		expect(calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
	});

	it('refuses an empty reason, an unknown verdict, a self pair and an unknown business', async () => {
		const base = {
			atlas_id: 'atlas-1',
			candidate_atlas_id: 'atlas-2',
			verdict: 'match' as const,
			reason: 'ok',
			labelled_by: 'm@lvh.me'
		};
		await expect(
			recordMaintainerLabel(fakeDb().db, { ...base, reason: ' ' })
		).rejects.toBeInstanceOf(OpsError);
		await expect(
			recordMaintainerLabel(fakeDb().db, { ...base, verdict: 'maybe' as never })
		).rejects.toBeInstanceOf(OpsError);
		await expect(
			recordMaintainerLabel(fakeDb().db, { ...base, candidate_atlas_id: 'atlas-1' })
		).rejects.toBeInstanceOf(OpsError);
		const missing = {
			prepare: () => ({ bind: () => ({ first: async () => ({ n: 1 }), run: async () => ({}) }) })
		} as unknown as D1Database;
		await expect(recordMaintainerLabel(missing, base)).rejects.toBeInstanceOf(OpsError);
	});
});
