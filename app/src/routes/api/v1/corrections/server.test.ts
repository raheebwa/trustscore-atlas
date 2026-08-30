// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashConfirmationToken } from '$lib/confirmation';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

interface ClaimState {
	atlas_id?: string;
	status?: string;
	verified_at?: string | null;
	token?: string;
	missing?: boolean;
}

function database(claim: ClaimState = {}): {
	db: D1Database;
	prepared: FakeStatement[];
	batches: FakeStatement[][];
} {
	const prepared: FakeStatement[] = [];
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => {
				const statement = { sql, bindings };
				prepared.push(statement);
				return {
					...statement,
					first: async () => {
						if (sql.includes('FROM claims')) {
							if (claim.missing) return null;
							return {
								claim_id: 'claim_1',
								atlas_id: claim.atlas_id ?? 'atlas-example-1',
								status: claim.status ?? 'confirmed',
								verified_at:
									claim.verified_at === undefined ? '2026-08-30T00:00:00Z' : claim.verified_at,
								confirmation_token: claim.token ?? null
							};
						}
						return sql.includes('FROM businesses') ? { atlas_id: 'atlas-example-1' } : null;
					}
				};
			}
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, prepared, batches };
}

const CLAIM_TOKEN = 'a-real-looking-claim-token';

function request(field = 'canonical_name', claim: Record<string, unknown> | null = {}): Request {
	return new Request('https://atlas.example.invalid/api/v1/corrections', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			atlas_id: 'atlas-example-1',
			field,
			value: 'Example Workshop Limited',
			evidence_url: 'https://example.org/evidence/example-workshop',
			...(claim === null ? {} : { claim_id: 'claim_1', claim_token: CLAIM_TOKEN, ...claim })
		})
	});
}

async function claimDatabase(state: ClaimState = {}) {
	return database({ token: await hashConfirmationToken(CLAIM_TOKEN), ...state });
}

describe('corrections API', () => {
	it('stores an unconfirmed correction with a hashed 24-hour token and event', async () => {
		const { db, prepared, batches } = await claimDatabase();
		const before = Date.now();
		const response = await POST({ platform: { env: { DB: db } }, request: request() } as never);
		const body = (await response.json()) as {
			correction_id: string;
			status: string;
			confirm_url: string;
			expires_at: string;
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			correction_id: expect.stringMatching(/^correction_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/correct\/correction_.+\?token=[a-f0-9]{64}$/)
		});
		expect(Date.parse(body.expires_at) - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
		expect(Date.parse(body.expires_at) - before).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
		expect(prepared[0].sql).not.toContain('atlas-example-1');
		expect(prepared[0].bindings).toEqual(['atlas-example-1']);

		const plainToken = new URL(body.confirm_url, 'https://atlas.example.invalid').searchParams.get(
			'token'
		)!;
		expect(batches[0][0].bindings).toContain(await hashConfirmationToken(plainToken));
		expect(batches[0][0].bindings).not.toContain(plainToken);
		expect(batches[0][0].bindings).toContain('unconfirmed');
		expect(batches[0][1].bindings).toContain('correction');
		expect(JSON.stringify(batches)).not.toContain(plainToken);
	});

	it('refuses identifier corrections before any database access', async () => {
		const { db, prepared, batches } = database();
		const response = await POST({
			platform: { env: { DB: db } },
			request: request('identifiers')
		} as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'field_not_correctable',
			message:
				'Identifiers, register statuses and licence standing can only be disputed through report_issue.'
		});
		expect(prepared).toHaveLength(0);
		expect(batches).toHaveLength(0);
	});

	/**
	 * A correction outranks a register at the next regeneration, so it is filed from a claim that
	 * was verified, by the person holding that claim's own link. Anyone else is told where to
	 * start rather than having their correction recorded and quietly never actionable.
	 */
	it('refuses a correction that names no claim, and says where to get one', async () => {
		const { db, batches } = await claimDatabase();
		const response = await POST({
			platform: { env: { DB: db } },
			request: request('canonical_name', null)
		} as never);
		const body = (await response.json()) as { error: string; claim_url: string };

		expect(response.status).toBe(403);
		expect(body.error).toBe('claim_required');
		expect(body.claim_url).toBe('/claim/atlas-example-1');
		expect(batches).toHaveLength(0);
	});

	it("refuses a claim token that is not that claim's own", async () => {
		const { db, batches } = await claimDatabase();
		const response = await POST({
			platform: { env: { DB: db } },
			request: request('canonical_name', { claim_token: 'not-the-token' })
		} as never);

		expect(response.status).toBe(403);
		expect(batches).toHaveLength(0);
	});

	it('refuses a claim that nobody verified', async () => {
		const { db, batches } = await claimDatabase({ verified_at: null });
		const response = await POST({
			platform: { env: { DB: db } },
			request: request()
		} as never);
		const body = (await response.json()) as { error: string };

		expect(response.status).toBe(403);
		expect(body.error).toBe('claim_not_verified');
		expect(batches).toHaveLength(0);
	});

	// A claimant verified on one business cannot correct another on the strength of that proof.
	it('refuses a claim that is about a different record', async () => {
		const { db, batches } = await claimDatabase({ atlas_id: 'atlas-someone-else' });
		const response = await POST({
			platform: { env: { DB: db } },
			request: request()
		} as never);

		expect(response.status).toBe(403);
		expect(batches).toHaveLength(0);
	});

	it('records the claim a correction was filed from', async () => {
		const { db, batches } = await claimDatabase();
		await POST({ platform: { env: { DB: db } }, request: request() } as never);

		expect(batches[0][0].bindings).toContain('claim_1');
	});
});
