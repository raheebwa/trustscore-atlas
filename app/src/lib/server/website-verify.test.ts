// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';

const challengeValue = 'atlas-claim: claim-123';

async function verify(
	overrides: Partial<{
		url: string;
		challengeValue: string;
		attempts: number;
		fetchImpl: typeof fetch;
	}> = {}
) {
	const { verifyWebsiteString } = await import('./website-verify');
	return verifyWebsiteString({
		url: 'https://example.com/claim',
		challengeValue,
		attempts: 0,
		fetchImpl: vi.fn(
			async () => new Response('not found', { headers: { 'content-type': 'text/plain' } })
		),
		...overrides
	});
}

describe('verifyWebsiteString', () => {
	it('accepts an exact match in the well-known file', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(`  ${challengeValue}\n`, {
					headers: { 'content-type': 'text/plain; charset=utf-8' }
				})
		);

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: true,
			probe: 'well_known',
			host: 'example.com'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(fetchImpl).toHaveBeenCalledWith('https://example.com/.well-known/atlas-claim.txt', {
			redirect: 'manual',
			signal: expect.any(AbortSignal),
			headers: {
				'user-agent': 'TrustScoreAtlasVerifier/1.0 (+https://atlas.trustscorehq.com/methodology)'
			}
		});
	});

	it('accepts an exact match in the meta tag', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response('not the challenge', { headers: { 'content-type': 'text/plain' } })
			)
			.mockResolvedValueOnce(
				new Response(
					`<html><head><meta name="atlas-claim" content="${challengeValue}"></head></html>`,
					{
						headers: { 'content-type': 'text/html; charset=utf-8' }
					}
				)
			);

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: true,
			probe: 'meta_tag',
			host: 'example.com'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://example.com/claim');
	});

	it('rejects a near-miss that only contains the challenge string', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(`prefix ${challengeValue} suffix`, {
					headers: { 'content-type': 'text/plain' }
				})
			)
			.mockResolvedValueOnce(
				new Response(`<meta name="atlas-claim" content="prefix ${challengeValue} suffix">`, {
					headers: { 'content-type': 'text/html' }
				})
			);

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'string_not_found'
		});
	});

	it('truncates and rejects a body over 512 KiB', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('x'.repeat(512 * 1024 + 1), { headers: { 'content-type': 'text/plain' } })
		);

		await expect(verify({ fetchImpl })).resolves.toEqual({ ok: false, outcome: 'body_too_large' });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('rejects a non-text content type', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(challengeValue, { headers: { 'content-type': 'application/octet-stream' } })
		);

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'unsupported_content_type'
		});
	});

	it('rejects http URLs before making a network call', async () => {
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(verify({ url: 'http://example.com/claim', fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'insecure_scheme'
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('rejects IP literals, localhost and internal hostnames', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const urls = [
			'https://127.0.0.1/claim',
			'https://[::1]/claim',
			'https://localhost/claim',
			'https://service.internal/claim',
			'https://service.local/claim',
			'https://service.localhost/claim',
			'https://intranet/claim',
			'https://user@example.com/claim',
			'https://example.com:8443/claim'
		];

		for (const url of urls) {
			await expect(verify({ url, fetchImpl })).resolves.toEqual({
				ok: false,
				outcome: 'invalid_host'
			});
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('does not follow a redirect to a private host', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/secret' } })
		);

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'redirect_not_followed'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('returns verification_timeout without upstream text on timeout', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new DOMException('upstream secret timeout details', 'AbortError'));

		await expect(verify({ fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'verification_timeout'
		});
	});

	it('refuses attempt 6 before making a network call', async () => {
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(verify({ attempts: 5, fetchImpl })).resolves.toEqual({
			ok: false,
			outcome: 'attempts_exhausted'
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
