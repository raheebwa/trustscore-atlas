// SPDX-License-Identifier: Apache-2.0
/**
 * The mail path carries a link that verifies a claim, so what matters here is that it goes to one
 * address over one provider, and that nothing it learns on the way is ever echoed back: not the
 * address, not the provider's reply. A caller only ever hears whether it went.
 */

import { describe, expect, it } from 'vitest';
import { resendMailer } from './mail';

function captured() {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetchImpl = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), init });
		return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

const message = {
	to: 'owner@example.co.ug',
	subject: 'Confirm your claim',
	text: 'Open this link to confirm.'
};

describe('resendMailer', () => {
	it('sends one message over the provider with the configured sender', async () => {
		const { calls, fetchImpl } = captured();
		const mailer = resendMailer({
			apiKey: 'key-example',
			from: 'claims@atlas.example.invalid',
			fetchImpl
		});

		expect(await mailer?.send(message)).toEqual({ sent: true });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://api.resend.com/emails');
		const headers = new Headers(calls[0].init.headers);
		expect(headers.get('authorization')).toBe('Bearer key-example');
		// A direct call with no user agent is refused with a 403, so this header is load-bearing.
		expect(headers.get('user-agent')).toMatch(/TrustScoreAtlas/);
		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			from: 'claims@atlas.example.invalid',
			to: ['owner@example.co.ug'],
			subject: 'Confirm your claim',
			text: 'Open this link to confirm.'
		});
	});

	it('reports a refusal without repeating the address or what the provider said', async () => {
		const fetchImpl = (async () =>
			new Response('{"message":"domain not verified for owner@example.co.ug"}', {
				status: 403
			})) as unknown as typeof fetch;
		const mailer = resendMailer({ apiKey: 'key', from: 'claims@atlas.example.invalid', fetchImpl });

		const result = await mailer?.send(message);

		expect(result).toEqual({ sent: false, reason: 'refused' });
		expect(JSON.stringify(result)).not.toContain('example.co.ug');
		expect(JSON.stringify(result)).not.toContain('domain not verified');
	});

	it('reports a network failure the same way, without the error text', async () => {
		const fetchImpl = (async () => {
			throw new Error('connect ECONNREFUSED 10.0.0.1:443');
		}) as unknown as typeof fetch;
		const mailer = resendMailer({ apiKey: 'key', from: 'claims@atlas.example.invalid', fetchImpl });

		expect(await mailer?.send(message)).toEqual({ sent: false, reason: 'unreachable' });
	});

	it('is not configured at all when the key or the sender is missing', () => {
		const { calls, fetchImpl } = captured();

		expect(
			resendMailer({ apiKey: '', from: 'claims@atlas.example.invalid', fetchImpl })
		).toBeNull();
		expect(resendMailer({ apiKey: 'key', from: ' ', fetchImpl })).toBeNull();
		expect(calls).toHaveLength(0);
	});
});
