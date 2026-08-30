import { describe, expect, it } from 'vitest';
import { getMethodology } from './methodology';

const published = {
	rubrics: [
		{
			name: 'formality',
			version: 1,
			title: 'Formality',
			question: 'Does the state know this business exists?',
			max: 100,
			licence: 'CC-BY-4.0',
			predicates: [{ id: 'legal_register_presence', points: 30, description: 'In the register.' }]
		}
	],
	packs: {
		UG: {
			precedence: { operator_verified: 1, register_of_record: 2 },
			bindings: { formality: { legal_register_presence: { sources: [] } } }
		}
	},
	linkage: { candidate_threshold: 0.5, review_band: [0.8, 0.95], model_version: 'v1' }
};

function db(rows: { key: string; value: string }[]): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return rows.find((r) => r.key === 'methodology') ?? null;
					return null;
				},
				all: async () => {
					if (sql.includes('FROM linkage_candidates')) {
						return {
							results: [
								{ band: 'candidate', n: 1819 },
								{ band: 'review', n: 3294 }
							]
						};
					}
					if (sql.includes('FROM aliases')) {
						return {
							results: [
								{ reason: 'label:match', n: 28 },
								{ reason: 'ug:tin', n: 46 }
							]
						};
					}
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

describe('getMethodology', () => {
	it('returns the published rubrics with live linkage band counts', async () => {
		const result = await getMethodology(
			db([{ key: 'methodology', value: JSON.stringify(published) }])
		);
		expect(result.published?.rubrics[0].name).toBe('formality');
		expect(result.published?.packs.UG.precedence.register_of_record).toBe(2);
		expect(result.linkage).toEqual({
			candidate: 1819,
			review: 3294,
			likely: 0,
			labelled_matches: 28,
			identifier_merges: 46
		});
	});

	it('reports nothing published when the serving database predates the key', async () => {
		const result = await getMethodology(db([]));
		expect(result.published).toBeNull();
		expect(result.linkage.candidate).toBe(1819);
	});
});
