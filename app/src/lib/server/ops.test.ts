import { describe, expect, it } from 'vitest';
import { decideRequest, listQueue, OpsError } from './ops';

interface Call {
	sql: string;
	bindings: unknown[];
}

function fakeDb(options: { existingDecision?: boolean; requestStatus?: string | null } = {}) {
	const calls: Call[] = [];
	const statement = (sql: string) => ({
		bind: (...bindings: unknown[]) => {
			const call = { sql, bindings };
			return {
				all: async () => {
					calls.push(call);
					if (sql.includes('FROM claims')) {
						return {
							results: [
								{
									request_id: 'claim_1',
									atlas_id: 'atlas-1',
									summary: 'owner',
									requested_at: '2026-08-30T01:00:00Z',
									confirmed_at: '2026-08-30T01:05:00Z'
								}
							]
						};
					}
					if (sql.includes('FROM corrections')) {
						return {
							results: [
								{
									request_id: 'correction_1',
									atlas_id: 'atlas-2',
									summary: 'website: https://www.example.invalid',
									requested_at: '2026-08-30T02:00:00Z',
									confirmed_at: '2026-08-30T02:05:00Z'
								}
							]
						};
					}
					return { results: [] };
				},
				first: async () => {
					calls.push(call);
					if (sql.includes('FROM moderation_decisions')) {
						return options.existingDecision ? { decision_id: 'decision_0' } : null;
					}
					if (sql.includes('status FROM')) {
						return options.requestStatus === null
							? null
							: { status: options.requestStatus ?? 'confirmed' };
					}
					return null;
				},
				run: async () => {
					calls.push(call);
					return { success: true };
				}
			};
		}
	});
	return { db: { prepare: statement } as unknown as D1Database, calls };
}

describe('listQueue', () => {
	it('lists confirmed requests of every kind that have no decision yet, oldest first', async () => {
		const { db, calls } = fakeDb();
		const queue = await listQueue(db);
		expect(queue.map((item) => [item.request_type, item.request_id])).toEqual([
			['claim', 'claim_1'],
			['correction', 'correction_1']
		]);
		for (const call of calls) {
			expect(call.sql).toContain('NOT EXISTS');
			expect(call.sql).toContain('moderation_decisions');
		}
	});
});

describe('decideRequest', () => {
	it('records an approval as an append-only decision with the actor and reason', async () => {
		const { db, calls } = fakeDb();
		const decision = await decideRequest(db, {
			request_type: 'correction',
			request_id: 'correction_1',
			decision: 'approved',
			reason: 'Evidence URL shows the website.',
			decided_by: 'maintainer@lvh.me'
		});
		expect(decision.decision_id).toMatch(/^decision_/);
		const insert = calls.find((call) => call.sql.includes('INSERT INTO moderation_decisions'));
		expect(insert?.bindings).toEqual([
			decision.decision_id,
			'correction',
			'correction_1',
			'approved',
			'Evidence URL shows the website.',
			'maintainer@lvh.me',
			decision.decided_at
		]);
		expect(calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
	});

	it('refuses a second decision, an empty reason, and a request that is not confirmed', async () => {
		const base = {
			request_type: 'issue' as const,
			request_id: 'issue_1',
			decision: 'rejected' as const,
			reason: 'Duplicate of an earlier report.',
			decided_by: 'maintainer@lvh.me'
		};
		await expect(decideRequest(fakeDb({ existingDecision: true }).db, base)).rejects.toBeInstanceOf(
			OpsError
		);
		await expect(decideRequest(fakeDb().db, { ...base, reason: '  ' })).rejects.toBeInstanceOf(
			OpsError
		);
		await expect(
			decideRequest(fakeDb({ requestStatus: 'unconfirmed' }).db, base)
		).rejects.toBeInstanceOf(OpsError);
		await expect(decideRequest(fakeDb({ requestStatus: null }).db, base)).rejects.toBeInstanceOf(
			OpsError
		);
	});
});
