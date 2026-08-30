// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { verifyAccessRequest } from './access';

const encoder = new TextEncoder();
const base64url = (bytes: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');

async function keyPair() {
	return crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256'
		},
		true,
		['sign', 'verify']
	);
}

async function token(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>) {
	const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
	const payload = base64url(encoder.encode(JSON.stringify(claims)));
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		encoder.encode(`${header}.${payload}`)
	);
	return `${header}.${payload}.${base64url(signature)}`;
}

describe('verifyAccessRequest', () => {
	it('accepts a signed assertion for the configured audience and returns the identity', async () => {
		const keys = await keyPair();
		const jwk = {
			...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
			kid: 'key-1',
			use: 'sig',
			alg: 'RS256'
		};
		const fetchCerts = async () => ({ keys: [jwk] });
		const now = Math.floor(Date.now() / 1000);
		const jwt = await token(keys.privateKey, 'key-1', {
			aud: ['aud-example'],
			email: 'maintainer@lvh.me',
			iss: 'https://example-team.cloudflareaccess.com',
			exp: now + 300,
			iat: now
		});
		const request = new Request('https://atlas.example.invalid/ops', {
			headers: { 'Cf-Access-Jwt-Assertion': jwt }
		});
		const identity = await verifyAccessRequest(
			request,
			{ teamDomain: 'example-team.cloudflareaccess.com', audience: 'aud-example' },
			fetchCerts
		);
		expect(identity).toEqual({ email: 'maintainer@lvh.me' });
	});

	it('rejects a missing header, a wrong audience, an expired token and a bad signature', async () => {
		const keys = await keyPair();
		const other = await keyPair();
		const jwk = {
			...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
			kid: 'key-1',
			use: 'sig',
			alg: 'RS256'
		};
		const fetchCerts = async () => ({ keys: [jwk] });
		const config = { teamDomain: 'example-team.cloudflareaccess.com', audience: 'aud-example' };
		const now = Math.floor(Date.now() / 1000);
		const good = {
			aud: ['aud-example'],
			email: 'maintainer@lvh.me',
			iss: 'https://example-team.cloudflareaccess.com',
			exp: now + 300,
			iat: now
		};
		const withHeader = (jwt: string) =>
			new Request('https://atlas.example.invalid/ops', {
				headers: { 'Cf-Access-Jwt-Assertion': jwt }
			});

		expect(
			await verifyAccessRequest(
				new Request('https://atlas.example.invalid/ops'),
				config,
				fetchCerts
			)
		).toBeNull();
		expect(
			await verifyAccessRequest(
				withHeader(await token(keys.privateKey, 'key-1', { ...good, aud: ['other'] })),
				config,
				fetchCerts
			)
		).toBeNull();
		expect(
			await verifyAccessRequest(
				withHeader(await token(keys.privateKey, 'key-1', { ...good, exp: now - 10 })),
				config,
				fetchCerts
			)
		).toBeNull();
		expect(
			await verifyAccessRequest(
				withHeader(await token(other.privateKey, 'key-1', good)),
				config,
				fetchCerts
			)
		).toBeNull();
	});

	it('fails closed when Access is not configured', async () => {
		const request = new Request('https://atlas.example.invalid/ops', {
			headers: { 'Cf-Access-Jwt-Assertion': 'anything' }
		});
		expect(await verifyAccessRequest(request, null, async () => ({ keys: [] }))).toBeNull();
	});
});
