// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { applyRequestRateLimit, isRateLimitedPath } from './rate-limit';

function platformWith(limiter: RateLimit): App.Platform {
	return { env: { API_LIMITER: limiter } } as App.Platform;
}

describe('request rate limiting', () => {
	it('covers every API route and every write confirmation route', () => {
		expect(isRateLimitedPath('/api/v1/businesses')).toBe(true);
		expect(isRateLimitedPath('/api/v1/corrections/correction_example/confirm')).toBe(true);
		expect(isRateLimitedPath('/claim/atlas-example-1')).toBe(true);
		expect(isRateLimitedPath('/correct/correction_example')).toBe(true);
		expect(isRateLimitedPath('/label/label_example')).toBe(true);
		expect(isRateLimitedPath('/report/issue_example')).toBe(true);
		expect(isRateLimitedPath('/tools')).toBe(false);
	});

	it('uses CF-Connecting-IP and continues when capacity remains', async () => {
		const limit = vi.fn(async () => ({ success: true }));
		const next = vi.fn(async () => new Response('ok'));
		const request = new Request('https://atlas.example.invalid/api/v1/businesses', {
			headers: { 'CF-Connecting-IP': '203.0.113.42' }
		});

		const response = await applyRequestRateLimit(
			request,
			new URL(request.url),
			platformWith({ limit } as RateLimit),
			next
		);

		expect(response.status).toBe(200);
		expect(limit).toHaveBeenCalledWith({ key: '203.0.113.42' });
		expect(next).toHaveBeenCalledOnce();
	});

	it('returns bounded JSON without reaching the route when capacity is exhausted', async () => {
		const next = vi.fn(async () => new Response('not reached'));
		const request = new Request('https://atlas.example.invalid/api/v1/issues', {
			headers: { 'CF-Connecting-IP': '203.0.113.43' }
		});
		const response = await applyRequestRateLimit(
			request,
			new URL(request.url),
			platformWith({ limit: async () => ({ success: false }) } as RateLimit),
			next
		);
		const text = await response.text();

		expect(response.status).toBe(429);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(JSON.parse(text)).toEqual({ error: 'rate_limit_exceeded' });
		expect(text.length).toBeLessThan(100);
		expect(next).not.toHaveBeenCalled();
	});

	it('does not call the binding for routes outside the protected surfaces', async () => {
		const limit = vi.fn(async () => ({ success: false }));
		const request = new Request('https://atlas.example.invalid/tools');
		const response = await applyRequestRateLimit(
			request,
			new URL(request.url),
			platformWith({ limit } as RateLimit),
			async () => new Response('ok')
		);

		expect(response.status).toBe(200);
		expect(limit).not.toHaveBeenCalled();
	});

	it('does not reach a protected route when the binding is unavailable', async () => {
		const next = vi.fn(async () => new Response('not reached'));
		const request = new Request('https://atlas.example.invalid/api/v1/businesses');
		const response = await applyRequestRateLimit(
			request,
			new URL(request.url),
			{ env: {} } as App.Platform,
			next
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'rate_limit_unavailable' });
		expect(next).not.toHaveBeenCalled();
	});

	it('does not echo a binding failure or reach the protected route', async () => {
		const next = vi.fn(async () => new Response('not reached'));
		const request = new Request('https://atlas.example.invalid/api/v1/businesses', {
			headers: { 'CF-Connecting-IP': '203.0.113.44' }
		});
		const response = await applyRequestRateLimit(
			request,
			new URL(request.url),
			platformWith({
				limit: async () => {
					throw new Error('example binding failure details');
				}
			} as RateLimit),
			next
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'rate_limit_unavailable' });
		expect(next).not.toHaveBeenCalled();
	});
});

describe('isRateLimitedPath for the remote MCP endpoint', () => {
	it('limits /mcp like the API', async () => {
		const { isRateLimitedPath } = await import('./rate-limit');
		expect(isRateLimitedPath('/mcp')).toBe(true);
		expect(isRateLimitedPath('/methodology')).toBe(false);
	});
});
