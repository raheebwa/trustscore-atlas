// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashConfirmationToken } from '$lib/confirmation';
import { loadWriteConfirmation } from './write-confirmation';

function database(row: Record<string, unknown>): { db: D1Database; statements: unknown[][] } {
	const statements: unknown[][] = [];
	const db = {
		prepare: () => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					statements.push(bindings);
					return row;
				}
			})
		})
	} as unknown as D1Database;
	return { db, statements };
}

describe('write confirmation page data', () => {
	it('returns the exact correction record for an unexpired hashed link', async () => {
		const token = 'example-page-token';
		const row = {
			correction_id: 'correction_example_1',
			atlas_id: 'atlas-example-1',
			field: 'canonical_name',
			value: 'Example Workshop Limited',
			evidence_url: 'https://example.org/evidence/example-workshop',
			requested_at: '2026-08-30T10:00:00.000Z',
			status: 'unconfirmed',
			expires_at: '2999-01-01T00:00:00.000Z'
		};
		const { db, statements } = database(row);
		const result = await loadWriteConfirmation(db, 'correction', row.correction_id, token);

		expect(result).toEqual({ state: 'unconfirmed', record: row, token });
		expect(statements[0]).toEqual([row.correction_id, await hashConfirmationToken(token)]);
	});

	it('returns exact label and issue records without applying them', async () => {
		const label = {
			label_id: 'label_example_1',
			atlas_id: 'atlas-example-1',
			candidate_atlas_id: 'atlas-example-2',
			verdict: 'non_match',
			requested_at: '2026-08-30T10:00:00.000Z',
			status: 'confirmed',
			expires_at: '2026-08-31T10:00:00.000Z'
		};
		const issue = {
			issue_id: 'issue_example_1',
			atlas_id: null,
			source: 'example.register',
			description: 'The example source date appears incomplete.',
			requested_at: '2026-08-30T10:00:00.000Z',
			status: 'unconfirmed',
			expires_at: '2000-01-01T00:00:00.000Z'
		};

		expect(
			await loadWriteConfirmation(
				database(label).db,
				'linkage_label',
				label.label_id,
				'label-token'
			)
		).toEqual({ state: 'confirmed', record: label, token: 'label-token' });
		expect(
			await loadWriteConfirmation(database(issue).db, 'issue', issue.issue_id, 'issue-token')
		).toEqual({ state: 'expired', record: issue, token: 'issue-token' });
	});
});
