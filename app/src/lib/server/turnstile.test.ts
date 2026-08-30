// SPDX-License-Identifier: Apache-2.0
/**
 * The check in front of the page forms.
 *
 * It exists to keep a script from filing thousands of claims, not to keep a person out, so the
 * rules are: a deployment with no keys configured is not broken by it, a configured deployment
 * refuses a form that arrives without a solved challenge, and the provider's own answer is never
 * echoed back to whoever submitted the form.
 */

import { describe, expect, it } from 'vitest';
import { verifyTurnstile } from './turnstile';

function fetchReturning(body: unknown, status = 200) {
	const calls: { url: string; body: URLSearchParams }[] = [];
	const fetchImpl = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), body: new URLSearchParams(String(init.body)) });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

describe('verifyTurnstile', () => {
	it('lets a form through untouched when the deployment has no secret', async () => {
		const { calls, fetchImpl } = fetchReturning({ success: false });

		expect(await verifyTurnstile({ secret: undefined, token: null, fetchImpl })).toEqual({
			ok: true,
			checked: false
		});
		expect(calls).toHaveLength(0);
	});

	it('refuses a form that arrives with no solved challenge', async () => {
		const { calls, fetchImpl } = fetchReturning({ success: true });

		expect(await verifyTurnstile({ secret: 'secret', token: null, fetchImpl })).toEqual({
			ok: false,
			checked: true
		});
		expect(calls).toHaveLength(0);
	});

	it('asks the provider and accepts what it accepts', async () => {
		const { calls, fetchImpl } = fetchReturning({ success: true });

		const result = await verifyTurnstile({
			secret: 'secret',
			token: 'a-solved-token',
			remoteIp: '203.0.113.10',
			fetchImpl
		});

		expect(result).toEqual({ ok: true, checked: true });
		expect(calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(calls[0].body.get('secret')).toBe('secret');
		expect(calls[0].body.get('response')).toBe('a-solved-token');
		expect(calls[0].body.get('remoteip')).toBe('203.0.113.10');
	});

	it('refuses what the provider refuses, without repeating its reasons', async () => {
		const { fetchImpl } = fetchReturning({
			success: false,
			'error-codes': ['timeout-or-duplicate']
		});

		const result = await verifyTurnstile({ secret: 'secret', token: 'stale', fetchImpl });

		expect(result).toEqual({ ok: false, checked: true });
		expect(JSON.stringify(result)).not.toContain('timeout-or-duplicate');
	});

	// A provider that cannot be reached must not become a way past the check.
	it('refuses when the provider cannot be reached at all', async () => {
		const fetchImpl = (async () => {
			throw new Error('connect ECONNREFUSED');
		}) as unknown as typeof fetch;

		expect(await verifyTurnstile({ secret: 'secret', token: 'a-token', fetchImpl })).toEqual({
			ok: false,
			checked: true
		});
	});
});
