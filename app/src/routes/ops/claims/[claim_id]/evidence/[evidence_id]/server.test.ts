// SPDX-License-Identifier: Apache-2.0
/**
 * Serving a claimant's document to a maintainer. It is a stranger's file on our own origin, so it
 * leaves as an attachment that is never sniffed and never cached, and only under the claim it
 * belongs to.
 */

import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function harness(row: Record<string, unknown> | null, object: unknown = { body: 'bytes' }) {
	const bound: unknown[][] = [];
	const gets: string[] = [];
	const db = {
		prepare: () => ({
			bind: (...bindings: unknown[]) => ({
				first: async () => {
					bound.push(bindings);
					return row;
				}
			})
		})
	} as unknown as D1Database;
	const bucket = {
		get: async (key: string) => {
			gets.push(key);
			return object;
		}
	} as unknown as R2Bucket;
	return { bound, gets, platform: { env: { DB: db, DATA: bucket } } };
}

const evidence = {
	r2_key: 'claims/claim_1/evidence_1',
	content_type: 'application/pdf',
	byte_size: 8
};

async function fetchEvidence(row: Record<string, unknown> | null, object?: unknown) {
	const context = harness(row, object);
	const response = await GET({
		params: { claim_id: 'claim_1', evidence_id: 'evidence_1' },
		platform: context.platform
	} as never);
	return { response, ...context };
}

describe('ops evidence fetch', () => {
	it('serves the document as an attachment that is never sniffed or cached', async () => {
		const { response, gets, bound } = await fetchEvidence(evidence);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		expect(response.headers.get('content-disposition')).toBe('attachment; filename="evidence_1"');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(gets).toEqual(['claims/claim_1/evidence_1']);
		// Both halves are bound, so a document cannot be fetched under another claim.
		expect(bound[0]).toEqual(['evidence_1', 'claim_1']);
	});

	it('says not found when the document does not belong to that claim', async () => {
		const { response, gets } = await fetchEvidence(null);

		expect(response.status).toBe(404);
		expect(gets).toHaveLength(0);
	});

	it('says not found when the row points at an object that is gone', async () => {
		const { response } = await fetchEvidence(evidence, null);

		expect(response.status).toBe(404);
	});
});
