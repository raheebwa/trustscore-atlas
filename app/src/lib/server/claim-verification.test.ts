// SPDX-License-Identifier: Apache-2.0
/**
 * A claim is a stranger asserting they run a business. The verification record is the only thing
 * standing between that assertion and an operator statement at precedence 1, so the rules that
 * govern it are worth pinning one by one: an attempt is counted before it is made, an exhausted
 * challenge never reaches the network, and a verified claim is never re-verified into something
 * else.
 */

import { describe, expect, it } from 'vitest';
import { prepareWebsiteChallenge, runWebsiteAttempt } from './claim-verification';

interface Recorded {
	sql: string;
	bindings: unknown[];
}

function fakeDatabase(rows: Record<string, unknown>, recorded: Recorded[]): D1Database {
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				// D1 rejects a statement whose bindings do not match its placeholders, and it rejects it
				// at run time rather than at type-check time, so the fake holds the same line.
				const placeholders = sql.split('?').length - 1;
				if (placeholders !== bindings.length) {
					throw new Error(`${placeholders} placeholders bound with ${bindings.length} values`);
				}
				recorded.push({ sql, bindings });
				return {
					first: async () => (sql.includes('FROM claim_challenges') ? rows.challenge : rows.claim),
					run: async () => ({
						meta: {
							changes: sql.includes('UPDATE claims')
								? ((rows.claimWriteChanges as number | undefined) ?? 1)
								: ((rows.changes as number | undefined) ?? 1)
						}
					}),
					all: async () => ({ results: [] })
				};
			}
		}),
		batch: async (statements: unknown[]) => statements.map(() => ({ meta: { changes: 1 } }))
	} as unknown as D1Database;
	return db;
}

const challenge = {
	challenge_id: 'chal_1',
	claim_id: 'claim_1',
	method: 'website_string',
	target: 'https://example.ug',
	challenge_value: 'atlas-verify-abc123',
	expires_at: '2099-01-01T00:00:00Z',
	consumed_at: null,
	attempts: 0
};

describe('prepareWebsiteChallenge', () => {
	it('stores the string and the origin it must appear on, and hands back what to publish', async () => {
		const recorded: Recorded[] = [];
		const { issued } = prepareWebsiteChallenge(
			fakeDatabase({}, recorded),
			'claim_1',
			'https://Example.ug/about',
			() => new Date('2026-08-30T00:00:00Z')
		);

		expect(issued.challenge_value).toMatch(/^atlas-verify-[a-z0-9]{16}$/);
		expect(issued.target).toBe('https://example.ug');
		expect(issued.instructions.some((line) => line.includes('.well-known/atlas-claim.txt'))).toBe(
			true
		);
		expect(issued.instructions.some((line) => line.includes('meta'))).toBe(true);

		const insert = recorded.find((entry) => entry.sql.includes('INSERT INTO claim_challenges'));
		expect(insert).toBeDefined();
		// The method is fixed by the statement itself, so it is never bound as a value.
		expect(insert?.sql).toContain("'website_string'");
		expect(insert?.bindings).toEqual([
			expect.stringMatching(/^chal_/),
			'claim_1',
			'https://example.ug',
			issued.challenge_value,
			'2026-08-30T00:00:00.000Z',
			issued.expires_at
		]);
	});

	it('refuses a target the verifier could never reach, before anything is stored', async () => {
		const recorded: Recorded[] = [];
		expect(() =>
			prepareWebsiteChallenge(fakeDatabase({}, recorded), 'claim_1', 'http://localhost/about')
		).toThrow(/https/i);
		expect(recorded.some((entry) => entry.sql.includes('INSERT'))).toBe(false);
	});

	// A challenge the verifier would refuse on sight is worse than a refusal: it looks like
	// progress and every check against it burns one of five attempts.
	it.each([
		'https://foo.localhost/',
		'https://example.ug:8443/',
		'https://user:pass@example.ug/',
		'https://example..ug/'
	])('refuses %s, which the verifier itself would refuse', (address) => {
		const recorded: Recorded[] = [];
		expect(() => prepareWebsiteChallenge(fakeDatabase({}, recorded), 'claim_1', address)).toThrow();
		expect(recorded.some((entry) => entry.sql.includes('INSERT'))).toBe(false);
	});
});

describe('runWebsiteAttempt', () => {
	it('counts the attempt before it runs, so a crash cannot buy a free retry', async () => {
		const recorded: Recorded[] = [];
		await runWebsiteAttempt(fakeDatabase({ challenge }, recorded), 'chal_1', {
			verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' })
		});

		const order = recorded.map((entry) => entry.sql);
		const increment = order.findIndex((sql) => sql.includes('attempts = attempts + 1'));
		const outcome = order.findIndex((sql) => sql.includes('outcome ='));
		expect(increment).toBeGreaterThanOrEqual(0);
		expect(increment).toBeLessThan(outcome);
	});

	it('writes the claim through on a match, once, with the host it proved', async () => {
		const recorded: Recorded[] = [];
		const result = await runWebsiteAttempt(fakeDatabase({ challenge }, recorded), 'chal_1', {
			verify: async () => ({ ok: true, probe: 'meta_tag', host: 'example.ug' })
		});

		expect(result.verified).toBe(true);
		const write = recorded.find((entry) => entry.sql.includes('UPDATE claims'));
		expect(write?.sql).toContain('verified_at IS NULL');
		expect(write?.bindings).toContain('example.ug');
	});

	it('records why an attempt failed without keeping anything the site said', async () => {
		const recorded: Recorded[] = [];
		const result = await runWebsiteAttempt(fakeDatabase({ challenge }, recorded), 'chal_1', {
			verify: async () => ({ ok: false, outcome: 'string_not_found' })
		});

		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('string_not_found');
		expect(recorded.some((entry) => entry.sql.includes('UPDATE claims'))).toBe(false);
		expect(JSON.stringify(recorded)).not.toContain('<html');
	});

	it('refuses an exhausted challenge without touching the network', async () => {
		const recorded: Recorded[] = [];
		let called = false;
		const result = await runWebsiteAttempt(
			fakeDatabase({ challenge: { ...challenge, attempts: 5 }, changes: 0 }, recorded),
			'chal_1',
			{
				verify: async () => {
					called = true;
					return { ok: true, probe: 'well_known', host: 'example.ug' };
				}
			}
		);

		expect(called).toBe(false);
		expect(result.outcome).toBe('attempts_exhausted');
	});

	it('refuses a challenge that has already been consumed', async () => {
		const recorded: Recorded[] = [];
		const result = await runWebsiteAttempt(
			fakeDatabase(
				{ challenge: { ...challenge, consumed_at: '2026-08-30T00:00:00Z' }, changes: 0 },
				recorded
			),
			'chal_1',
			{ verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' }) }
		);

		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('already_verified');
	});

	it('says nothing at all about a challenge that does not exist', async () => {
		const result = await runWebsiteAttempt(fakeDatabase({ challenge: null }, []), 'chal_missing', {
			verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' })
		});

		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('not_found');
	});

	it('never runs a challenge that is not a website challenge', async () => {
		const recorded: Recorded[] = [];
		let called = false;
		const result = await runWebsiteAttempt(
			fakeDatabase({ challenge: { ...challenge, method: 'domain_email' } }, recorded),
			'chal_1',
			{
				verify: async () => {
					called = true;
					return { ok: true, probe: 'well_known', host: 'example.ug' };
				}
			}
		);

		expect(called).toBe(false);
		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('wrong_method');
	});

	// An empty needle matches an empty file, so a challenge with no string to look for must never
	// reach the verifier: the domain_email shape stores a hash instead and leaves this column null.
	it('never runs a challenge that has no string to look for', async () => {
		const recorded: Recorded[] = [];
		let called = false;
		const result = await runWebsiteAttempt(
			fakeDatabase({ challenge: { ...challenge, challenge_value: null } }, recorded),
			'chal_1',
			{
				verify: async () => {
					called = true;
					return { ok: true, probe: 'well_known', host: 'example.ug' };
				}
			}
		);

		expect(called).toBe(false);
		expect(result.outcome).toBe('wrong_method');
	});

	it('treats an unreadable expiry as expired rather than as open', async () => {
		const result = await runWebsiteAttempt(
			fakeDatabase({ challenge: { ...challenge, expires_at: 'not a date' } }, []),
			'chal_1',
			{ verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' }) }
		);

		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('expired');
	});

	// Two clicks can race to the same challenge. The one that loses the write-once guard must say
	// so rather than reporting a verification it did not make.
	it('does not report a verification when the claim was already written through', async () => {
		const recorded: Recorded[] = [];
		const result = await runWebsiteAttempt(
			fakeDatabase({ challenge, changes: 1, claimWriteChanges: 0 }, recorded),
			'chal_1',
			{ verify: async () => ({ ok: true, probe: 'meta_tag', host: 'example.ug' }) }
		);

		expect(result.verified).toBe(false);
		expect(result.outcome).toBe('already_verified');
		expect(recorded.some((entry) => entry.sql.includes('INSERT INTO claim_events'))).toBe(false);
	});

	it('records the verification in the audit table the rest of the lifecycle uses', async () => {
		const recorded: Recorded[] = [];
		await runWebsiteAttempt(fakeDatabase({ challenge }, recorded), 'chal_1', {
			verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' })
		});

		const event = recorded.find((entry) => entry.sql.includes('INSERT INTO claim_events'));
		expect(event).toBeDefined();
		expect(event?.bindings).toContain('claim_1');
		expect(JSON.stringify(event?.bindings)).toContain('well_known');
		// The string itself is never written into an audit payload.
		expect(JSON.stringify(event?.bindings)).not.toContain(challenge.challenge_value);
	});

	it('leaves a reason on the challenge when the window has closed', async () => {
		const recorded: Recorded[] = [];
		await runWebsiteAttempt(
			fakeDatabase({ challenge: { ...challenge, expires_at: '2000-01-01T00:00:00Z' } }, recorded),
			'chal_1',
			{ verify: async () => ({ ok: true, probe: 'well_known', host: 'example.ug' }) }
		);

		const outcome = recorded.find((entry) => entry.sql.includes('outcome ='));
		expect(outcome?.bindings).toContain('expired');
	});
});
