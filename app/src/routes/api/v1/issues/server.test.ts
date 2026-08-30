// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { POST } from './+server';

interface FakeStatement {
	sql: string;
	bindings: unknown[];
}

function database(): { db: D1Database; batches: FakeStatement[][] } {
	const batches: FakeStatement[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({ sql, bindings })
		}),
		batch: async (statements: FakeStatement[]) => {
			batches.push(statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, batches };
}

describe('issues API', () => {
	it('stores an unconfirmed issue with optional scope values', async () => {
		const { db, batches } = database();
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/issues', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					source: 'example.register',
					description: 'The example source date appears incomplete.'
				})
			})
		} as never);
		const body = (await response.json()) as {
			issue_id: string;
			status: string;
			confirm_url: string;
		};

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			issue_id: expect.stringMatching(/^issue_/),
			status: 'unconfirmed',
			confirm_url: expect.stringMatching(/^\/report\/issue_.+\?token=[a-f0-9]{64}$/)
		});
		expect(batches[0][0].bindings).toContain(null);
		expect(batches[0][0].bindings).toContain('example.register');
		expect(batches[0][0].bindings).toContain('The example source date appears incomplete.');
		expect(batches[0][1].bindings).toContain('issue');
	});
});

describe('issues API from a page form', () => {
	it('accepts a form post and sends the browser to the confirmation page', async () => {
		const { db, batches } = database();
		const body = new URLSearchParams({
			atlas_id: 'atlas-example-1',
			description: 'The website on this record points at the wrong company.'
		});
		const response = await POST({
			platform: { env: { DB: db } },
			request: new Request('https://atlas.example.invalid/api/v1/issues', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body
			})
		} as never);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toMatch(/^\/report\/issue_.+\?token=[a-f0-9]{64}$/);
		expect(batches[0][0].bindings).toContain('atlas-example-1');
		expect(batches[0][0].bindings).toContain(
			'The website on this record points at the wrong company.'
		);
	});

	/**
	 * The report form is the other door a stranger can walk through, so it carries the same check
	 * and the same rule about where a refusal lands: back on the record, not on a body.
	 */
	it('sends a refused report back to the record it was about', async () => {
		const { db, batches } = database();
		const body = new URLSearchParams({
			atlas_id: 'atlas-example-1',
			description: 'The website on this record points at the wrong company.'
		});
		const response = await POST({
			platform: { env: { DB: db, TURNSTILE_SECRET_KEY: 'a-secret' } },
			request: new Request('https://atlas.example.invalid/api/v1/issues', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body
			}),
			fetch: async () => new Response(JSON.stringify({ success: true }), { status: 200 })
		} as never);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/b/atlas-example-1?report=challenge_failed');
		expect(batches).toHaveLength(0);
	});

	it('records a report whose challenge was solved', async () => {
		const { db, batches } = database();
		const body = new URLSearchParams({
			atlas_id: 'atlas-example-1',
			description: 'The website on this record points at the wrong company.',
			'cf-turnstile-response': 'a-solved-token'
		});
		const response = await POST({
			platform: { env: { DB: db, TURNSTILE_SECRET_KEY: 'a-secret' } },
			request: new Request('https://atlas.example.invalid/api/v1/issues', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body
			}),
			fetch: async () => new Response(JSON.stringify({ success: true }), { status: 200 })
		} as never);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toMatch(/^\/report\/issue_/);
		expect(batches).toHaveLength(1);
	});
});
