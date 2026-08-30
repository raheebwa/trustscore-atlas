// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { deriveEtag } from './etag';

describe('deriveEtag', () => {
	it('is quoted, per RFC 7232', () => {
		const etag = deriveEtag('regen-1', '/api/v1/sources', 'deploy-1');
		expect(etag.startsWith('"')).toBe(true);
		expect(etag.endsWith('"')).toBe(true);
	});

	it('is stable for the same regeneration id and path', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources', 'deploy-1');
		const b = deriveEtag('regen-1', '/api/v1/sources', 'deploy-1');
		expect(a).toBe(b);
	});

	it('changes when the regeneration id changes', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources', 'deploy-1');
		const b = deriveEtag('regen-2', '/api/v1/sources', 'deploy-1');
		expect(a).not.toBe(b);
	});

	it('changes when the deployment changes, so a new build never serves a stale 304', () => {
		const a = deriveEtag('regen-1', '/api/v1/search', 'deploy-1');
		const b = deriveEtag('regen-1', '/api/v1/search', 'deploy-2');
		expect(a).not.toBe(b);
	});

	it('treats an unknown deployment as its own value rather than colliding with a known one', () => {
		expect(deriveEtag('regen-1', '/api/v1/search', null)).not.toBe(
			deriveEtag('regen-1', '/api/v1/search', 'deploy-1')
		);
	});

	it('changes when the path changes', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources', 'deploy-1');
		const b = deriveEtag('regen-1', '/api/v1/businesses', 'deploy-1');
		expect(a).not.toBe(b);
	});
});
