// SPDX-License-Identifier: Apache-2.0
/**
 * The queue screen's own server half.
 *
 * Two things here are security-relevant and neither is visible in the library tests: the gate the
 * screen shows has to be the gate the decision applies, and the attestation the maintainer ticks
 * has to reach the decision as the boolean it is. A checkbox that silently stopped arriving would
 * turn every unmatched-domain approval into a refusal, or worse, a checkbox that arrived when
 * nobody ticked it would let a domain through unattested.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/access', () => ({
	accessConfigFrom: () => ({ teamDomain: 'example.cloudflareaccess.com', audience: 'aud' }),
	verifyAccessRequest: async () => ({ email: 'ops@lvh.me' })
}));

const decideRequest = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/ops', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/ops')>()),
	decideRequest
}));

const { actions, load } = await import('./+page.server');

function database(rows: Record<string, unknown>[]) {
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				sql,
				bindings,
				first: async () => null,
				all: async () => {
					if (sql.includes('claim_id IN (')) {
						return {
							results: [
								{
									claim_id: 'claim_1',
									atlas_id: 'atlas-1',
									verified_at: null,
									verified_domain: null,
									verification_method: null
								}
							]
						};
					}
					if (sql.includes('FROM claims')) return { results: rows };
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
	return { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } };
}

describe('moderation queue screen', () => {
	it('offers the same gate the decision applies, rather than a button that is always refused', async () => {
		const platform = database([
			{
				request_id: 'claim_1',
				atlas_id: 'atlas-1',
				summary: 'owner or director',
				requested_at: '2026-08-30T01:00:00Z',
				confirmed_at: '2026-08-30T01:05:00Z'
			}
		]);

		const data = await load({ platform, parent: async () => ({}) } as never);
		if (!data) throw new Error('Expected queue data');

		expect(data.queue[0].gate.approvable).toBe(false);
		expect(data.queue[0].gate.reason).toMatch(/not verified/i);
	});

	it('passes the ticked attestation to the decision as a boolean', async () => {
		decideRequest.mockResolvedValue({ request_id: 'claim_1', decision: 'approved' });
		const form = new FormData();
		form.set('request_type', 'claim');
		form.set('request_id', 'claim_1');
		form.set('decision', 'approved');
		form.set('reason', 'The licence names the same domain.');
		form.set('domain_relationship_reviewed', 'on');

		await actions.decide({
			platform: database([]),
			request: new Request('https://atlas.example.invalid/ops', { method: 'POST', body: form })
		} as never);

		expect(decideRequest).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ domain_relationship_reviewed: true, decided_by: 'ops@lvh.me' })
		);
	});

	it('treats an untouched checkbox as untouched', async () => {
		decideRequest.mockResolvedValue({ request_id: 'claim_1', decision: 'approved' });
		const form = new FormData();
		form.set('request_type', 'claim');
		form.set('request_id', 'claim_1');
		form.set('decision', 'approved');
		form.set('reason', 'A register published the domain.');

		await actions.decide({
			platform: database([]),
			request: new Request('https://atlas.example.invalid/ops', { method: 'POST', body: form })
		} as never);

		expect(decideRequest).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ domain_relationship_reviewed: false })
		);
	});

	it('returns a refusal in the words the decision refused it with', async () => {
		const { OpsError } = await import('$lib/server/ops');
		decideRequest.mockRejectedValue(new OpsError('This claim is not verified.'));
		const form = new FormData();
		form.set('request_type', 'claim');
		form.set('request_id', 'claim_1');
		form.set('decision', 'approved');
		form.set('reason', 'Looks right to me.');

		const result = await actions.decide({
			platform: database([]),
			request: new Request('https://atlas.example.invalid/ops', { method: 'POST', body: form })
		} as never);

		expect(result).toMatchObject({ status: 400, data: { message: 'This claim is not verified.' } });
	});
});
