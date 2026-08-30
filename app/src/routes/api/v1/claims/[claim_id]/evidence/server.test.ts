// SPDX-License-Identifier: Apache-2.0
/**
 * What may be attached to a claim, and by whom.
 *
 * A document proves nothing, so these tests are about the store rather than the meaning: an
 * oversized upload is refused from its declared length before the body is read, a file that is not
 * one of the three types is refused whatever it calls itself, and the claim's own token is the
 * only way in.
 */

import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { POST } from './+server';

const TOKEN = 'a-real-looking-token';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

interface Options {
	status?: string;
	expiresAt?: string | null;
	documents?: number;
	declaredLength?: string;
}

async function harness(options: Options = {}) {
	const hashed = await hashClaimConfirmationToken(TOKEN);
	const puts: { key: string }[] = [];
	const rows: unknown[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				first: async () =>
					sql.includes('FROM claim_evidence')
						? { documents: options.documents ?? 0 }
						: {
								claim_id: 'claim_1',
								atlas_id: 'atlas-example-1',
								status: options.status ?? 'confirmed',
								expires_at:
									options.expiresAt === undefined ? '2999-01-01T00:00:00.000Z' : options.expiresAt,
								confirmation_token: hashed
							},
				run: async () => {
					rows.push(bindings);
					return { meta: { changes: 1 } };
				}
			})
		})
	} as unknown as D1Database;
	const bucket = {
		put: async (key: string) => {
			puts.push({ key });
			return {};
		}
	} as unknown as R2Bucket;
	return { db, bucket, puts, rows, platform: { env: { DB: db, DATA: bucket } } };
}

async function upload(
	bytes: Uint8Array,
	fields: Record<string, string> = { token: TOKEN },
	options: Options = {}
) {
	const context = await harness(options);
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	form.set('file', new File([bytes as BlobPart], 'evidence.pdf', { type: 'application/pdf' }));
	const request = new Request('https://atlas.example.invalid/api/v1/claims/claim_1/evidence', {
		method: 'POST',
		body: form
	});
	if (options.declaredLength) {
		Object.defineProperty(request.headers, 'get', {
			value: (name: string) =>
				name.toLowerCase() === 'content-length' ? options.declaredLength : null
		});
	}
	const response = await POST({
		params: { claim_id: 'claim_1' },
		platform: context.platform,
		request
	} as never);
	return { response, ...context };
}

describe('claim evidence upload', () => {
	it('stores a document under the claim and says what it stored', async () => {
		const { response, puts, rows } = await upload(PDF);
		const body = (await response.json()) as { evidence_id: string; content_type: string };

		expect(response.status).toBe(201);
		expect(body.content_type).toBe('application/pdf');
		expect(puts[0].key).toBe(`claims/claim_1/${body.evidence_id}`);
		expect(rows[0]).toContain('application/pdf');
	});

	// The point of reading the declared length first is that the bytes are never taken in at all.
	it('refuses an oversized upload from its declared length, before reading it', async () => {
		const { response, puts } = await upload(PDF, { token: TOKEN }, { declaredLength: '99999999' });

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: 'evidence_too_large' });
		expect(puts).toHaveLength(0);
	});

	it('refuses a file that is not a document, whatever it calls itself', async () => {
		const { response, puts } = await upload(EXE);

		expect(response.status).toBe(400);
		expect(puts).toHaveLength(0);
	});

	it('says only "not found" to a wrong token', async () => {
		const { response, puts } = await upload(PDF, { token: 'not-the-token' });

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'claim_not_found' });
		expect(puts).toHaveLength(0);
	});

	it('refuses a claim that was never confirmed, and one whose window has closed', async () => {
		expect((await upload(PDF, { token: TOKEN }, { status: 'unconfirmed' })).response.status).toBe(
			409
		);
		expect(
			(await upload(PDF, { token: TOKEN }, { expiresAt: '2000-01-01T00:00:00Z' })).response.status
		).toBe(410);
	});

	it('refuses a sixth document rather than taking a filing cabinet', async () => {
		const { response, puts } = await upload(PDF, { token: TOKEN }, { documents: 5 });

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'evidence_limit_reached' });
		expect(puts).toHaveLength(0);
	});

	it('needs both the token and a file', async () => {
		const context = await harness();
		const form = new FormData();
		form.set('token', TOKEN);
		const response = await POST({
			params: { claim_id: 'claim_1' },
			platform: context.platform,
			request: new Request('https://atlas.example.invalid/api/v1/claims/claim_1/evidence', {
				method: 'POST',
				body: form
			})
		} as never);

		expect(response.status).toBe(400);
		expect(context.puts).toHaveLength(0);
	});

	it('sends a page claimant back to their own claim rather than to a body', async () => {
		const { response } = await upload(PDF, { token: TOKEN, from: 'page' });

		expect(response.status).toBe(303);
		const location = new URL(
			response.headers.get('location') ?? '',
			'https://atlas.example.invalid'
		);
		expect(location.pathname).toBe('/claim/atlas-example-1');
		expect(location.searchParams.get('claim')).toBe('claim_1');
		expect(location.searchParams.get('token')).toBe(TOKEN);
	});
});
