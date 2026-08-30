// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { approvalGate, decideRequest, listQueue, OpsError } from './ops';

interface Call {
	sql: string;
	bindings: unknown[];
}

function fakeDb(options: { existingDecision?: boolean; requestStatus?: string | null } = {}) {
	const calls: Call[] = [];
	const batched: Call[] = [];
	const statement = (sql: string) => ({
		bind: (...bindings: unknown[]) => {
			const call = { sql, bindings };
			// A prepared statement carries what it was prepared and bound with, so a statement that
			// goes into a batch can still be read back by the test.
			return {
				...call,
				all: async () => {
					calls.push(call);
					// The claim facts a decision stands on, read for every listed claim at once.
					if (sql.includes('claim_id IN (')) {
						return {
							results: [
								{
									claim_id: 'claim_1',
									atlas_id: 'atlas-2',
									verified_at: '2026-08-30T00:00:00Z',
									verified_domain: 'example.invalid',
									verification_method: 'website_string'
								}
							]
						};
					}
					if (sql.includes('FROM statements')) {
						return { results: [{ atlas_id: 'atlas-2', value: 'https://example.invalid' }] };
					}
					if (sql.includes('FROM claim_evidence')) return { results: [] };
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
					if (sql.includes('FROM claim_evidence')) return { documents: 0 };
					// The claim behind a request, which every approval now stands on.
					if (sql.includes('verified_at, verified_domain')) {
						return {
							claim_id: 'claim_1',
							atlas_id: 'atlas-1',
							verified_at: '2026-08-30T00:00:00Z',
							verified_domain: 'example.invalid',
							verification_method: 'website_string'
						};
					}
					if (sql.startsWith('SELECT * FROM')) {
						if (options.requestStatus === null) return null;
						return {
							status: options.requestStatus ?? 'confirmed',
							atlas_id: 'atlas-2',
							claim_id: 'claim_1',
							field: 'location.district',
							value: 'Wakiso'
						};
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
	const db = {
		prepare: statement,
		batch: async (statements: Call[]) => {
			batched.push(...statements);
			calls.push(...statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, calls, batched };
}

describe('listQueue', () => {
	it('lists confirmed requests of every kind that have no decision yet, oldest first', async () => {
		const { db, calls } = fakeDb();
		const queue = await listQueue(db, db);
		expect(queue.map((item) => [item.request_type, item.request_id])).toEqual([
			['claim', 'claim_1'],
			['correction', 'correction_1']
		]);
		// Every listing query is bounded to requests with no decision yet; the queries that follow
		// are about the claim behind a listed request rather than about the listing.
		const listings = calls.filter((call) => call.sql.includes("status = 'confirmed'"));
		expect(listings).not.toHaveLength(0);
		for (const call of listings) {
			expect(call.sql).toContain('NOT EXISTS');
			expect(call.sql).toContain('moderation_decisions');
		}
	});
});

describe('decideRequest', () => {
	it('records an approval as an append-only decision with the actor and reason', async () => {
		const { db, calls } = fakeDb();
		const decision = await decideRequest(db, db, {
			request_type: 'correction',
			request_id: 'correction_1',
			decision: 'approved',
			reason: 'Evidence URL shows the website.',
			decided_by: 'maintainer@lvh.me',
			domain_relationship_reviewed: true
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
			decision.decided_at,
			// What the approval rested on: the register published the proven domain, and the
			// maintainer's own attestation was not needed.
			1,
			1
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
		const existing = fakeDb({ existingDecision: true });
		await expect(decideRequest(existing.db, existing.db, base)).rejects.toBeInstanceOf(OpsError);
		const empty = fakeDb();
		await expect(
			decideRequest(empty.db, empty.db, { ...base, reason: '  ' })
		).rejects.toBeInstanceOf(OpsError);
		const unconfirmed = fakeDb({ requestStatus: 'unconfirmed' });
		await expect(decideRequest(unconfirmed.db, unconfirmed.db, base)).rejects.toBeInstanceOf(
			OpsError
		);
		const missing = fakeDb({ requestStatus: null });
		await expect(decideRequest(missing.db, missing.db, base)).rejects.toBeInstanceOf(OpsError);
	});
});

/**
 * The verification gate.
 *
 * A verified claim is the only thing that outranks a register, so approval is where that rule is
 * enforced: an unverified claim cannot be approved at all, and a verified one whose proven domain
 * is not a domain the record itself publishes needs a maintainer to say, in the reason, what
 * connects the two. Rejection is never gated: a claim that cannot be approved must still be
 * closeable.
 */
describe('the verification gate on approval', () => {
	interface GateOptions {
		verifiedAt?: string | null;
		verifiedDomain?: string | null;
		published?: string[];
		claimId?: string | null;
		claimAtlasId?: string;
		requestAtlasId?: string;
		field?: string;
		reviewed?: boolean;
		type?: 'claim' | 'correction';
	}

	function gateDatabase(options: GateOptions) {
		const statements: { sql: string; bindings: unknown[] }[] = [];
		const db = {
			prepare: (sql: string) => ({
				bind: (...bindings: unknown[]) => ({
					sql,
					bindings,
					first: async () => {
						if (sql.includes('FROM moderation_decisions')) return null;
						if (sql.includes('FROM claims')) {
							return { status: 'confirmed', claim_id: 'claim_1', atlas_id: 'atlas-example-1' };
						}
						return {
							status: 'confirmed',
							correction_id: 'correction_1',
							atlas_id: options.requestAtlasId ?? 'atlas-example-1',
							claim_id: options.claimId === undefined ? 'claim_1' : options.claimId,
							field: options.field ?? 'location.district',
							value: 'Wakiso'
						};
					},
					all: async () => {
						if (sql.includes('FROM claims')) {
							return {
								results: [
									{
										claim_id: 'claim_1',
										atlas_id: options.claimAtlasId ?? 'atlas-example-1',
										verified_at:
											options.verifiedAt === undefined
												? '2026-08-30T00:00:00Z'
												: options.verifiedAt,
										verified_domain:
											options.verifiedDomain === undefined
												? 'example.co.ug'
												: options.verifiedDomain,
										verification_method: 'website_string'
									}
								]
							};
						}
						if (sql.includes('FROM statements')) {
							return {
								results: (options.published ?? ['https://example.co.ug']).map((value) => ({
									atlas_id: options.claimAtlasId ?? 'atlas-example-1',
									value
								}))
							};
						}
						return { results: [] };
					},
					run: async () => ({ meta: { changes: 1 } })
				})
			}),
			batch: async (batched: { sql: string; bindings: unknown[] }[]) => {
				statements.push(...batched);
				return [];
			}
		} as unknown as D1Database;
		return { db, statements };
	}

	async function decide(options: GateOptions = {}, decision: 'approved' | 'rejected' = 'approved') {
		const { db, statements } = gateDatabase(options);
		const record = await decideRequest(db, db, {
			request_type: options.type ?? 'claim',
			request_id: options.type === 'correction' ? 'correction_1' : 'claim_1',
			decision,
			reason: 'The licence and the website agree.',
			decided_by: 'ops@lvh.me',
			domain_relationship_reviewed: options.reviewed
		});
		return { record, statements };
	}

	const operatorStatement = (statements: { sql: string; bindings: unknown[] }[]) =>
		statements.find((entry) => entry.sql.includes('INSERT INTO operator_statements'));

	it('refuses to approve a claim nobody verified', async () => {
		await expect(decide({ verifiedAt: null })).rejects.toThrow(/not verified/i);
	});

	it('still allows a claim nobody verified to be rejected', async () => {
		const { record } = await decide({ verifiedAt: null }, 'rejected');

		expect(record.decision).toBe('rejected');
	});

	it('approves a claim whose proven domain is one a register published', async () => {
		const { record, statements } = await decide({
			verifiedDomain: 'www.example.co.ug',
			published: ['https://example.co.ug']
		});

		expect(record.decision).toBe('approved');
		expect(operatorStatement(statements)?.bindings).toContain('status.operator_verified');
		expect(operatorStatement(statements)?.bindings).toContain('claim_1');
	});

	it('refuses a domain no register published unless the maintainer says they checked', async () => {
		await expect(decide({ verifiedDomain: 'somewhere-else.example' })).rejects.toThrow(
			/domain relationship reviewed/i
		);

		const { record } = await decide({ verifiedDomain: 'somewhere-else.example', reviewed: true });
		expect(record.decision).toBe('approved');
	});

	// The register check reads a table a regeneration drops and rebuilds, so what it answered at
	// the moment of the decision is written down with the decision rather than looked up again.
	it('records what the approval rested on', async () => {
		const { statements } = await decide();
		const decision = statements.find((entry) =>
			entry.sql.includes('INSERT INTO moderation_decisions')
		);

		expect(decision?.sql).toContain('domain_matched_register');
		expect(decision?.sql).toContain('domain_relationship_reviewed');
		expect(decision?.bindings.slice(-2)).toEqual([1, 0]);

		const attested = await decide({ verifiedDomain: 'somewhere-else.example', reviewed: true });
		const attestedDecision = attested.statements.find((entry) =>
			entry.sql.includes('INSERT INTO moderation_decisions')
		);
		expect(attestedDecision?.bindings.slice(-2)).toEqual([0, 1]);
	});

	it('writes the decision and the operator statement together', async () => {
		const { statements } = await decide();

		expect(statements.some((entry) => entry.sql.includes('INSERT INTO moderation_decisions'))).toBe(
			true
		);
		expect(operatorStatement(statements)).toBeDefined();
	});

	it('writes no operator statement when the decision is a rejection', async () => {
		const { statements } = await decide({}, 'rejected');

		expect(operatorStatement(statements)).toBeUndefined();
	});

	it('approves a correction bound to a verified claim, carrying its field and value', async () => {
		const { statements } = await decide({ type: 'correction' });

		expect(operatorStatement(statements)?.bindings).toContain('location.district');
		expect(operatorStatement(statements)?.bindings).toContain('Wakiso');
	});

	/**
	 * Nothing writes corrections.claim_id yet, so every correction in the queue today is bound to
	 * no claim. Such a correction is recorded exactly as it was before claims could be verified:
	 * a decision, asserting nothing. Refusing it instead would make the whole queue undecidable.
	 */
	it('records a correction bound to no claim, and asserts nothing for it', async () => {
		const { record, statements } = await decide({ type: 'correction', claimId: null });

		expect(record.decision).toBe('approved');
		expect(operatorStatement(statements)).toBeUndefined();
	});

	it('refuses a correction whose claim is not verified', async () => {
		await expect(decide({ type: 'correction', verifiedAt: null })).rejects.toThrow(/not verified/i);
	});

	// A claimant proved a domain for one business. Asserting something about another business on
	// the strength of that proof is the whole shape of the attack this refuses.
	it('refuses a correction that names a different record from its claim', async () => {
		await expect(
			decide({ type: 'correction', requestAtlasId: 'atlas-someone-else' })
		).rejects.toThrow(/different record/i);
	});

	it.each(['website', 'description'])(
		'refuses a correction to %s, which Atlas never publishes',
		async (field) => {
			await expect(decide({ type: 'correction', field })).rejects.toThrow(/does not publish/i);
		}
	);
});

describe('approvalGate', () => {
	const verified = {
		state: 'verified' as const,
		method: 'website_string',
		verified_domain: 'example.co.ug',
		domain_matches_register: true,
		evidence: []
	};

	it('gates nothing on a request that asserts nothing about a claimant', () => {
		expect(approvalGate({})).toEqual({
			approvable: true,
			needs_relationship_review: false,
			reason: null
		});
	});

	it('refuses an unverified claim in the same words the decision would', () => {
		const gate = approvalGate({ verification: { ...verified, state: 'unverified' } });

		expect(gate.approvable).toBe(false);
		expect(gate.reason).toMatch(/not verified/i);
	});

	it('asks for the relationship to be reviewed when no register published the domain', () => {
		const gate = approvalGate({
			verification: { ...verified, domain_matches_register: false }
		});

		expect(gate).toMatchObject({ approvable: true, needs_relationship_review: true });
		expect(gate.reason).toMatch(/domain relationship reviewed/i);
	});

	it('asks nothing further when the register published the proven domain', () => {
		expect(approvalGate({ verification: verified })).toEqual({
			approvable: true,
			needs_relationship_review: false,
			reason: null
		});
	});

	// A field Atlas does not publish cannot be asserted, so the screen refuses it rather than
	// offering a button that records a decision with no effect.
	it.each(['website', 'description'])(
		'refuses a correction to %s, which Atlas never publishes',
		(field) => {
			const gate = approvalGate({ request_type: 'correction', field, verification: verified });

			expect(gate.approvable).toBe(false);
			expect(gate.reason).toContain(field);
		}
	);

	it('allows a correction to a field the pipeline does publish', () => {
		const gate = approvalGate({
			request_type: 'correction',
			field: 'location.district',
			verification: verified
		});

		expect(gate.approvable).toBe(true);
	});
});
