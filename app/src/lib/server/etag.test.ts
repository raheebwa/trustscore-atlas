import { describe, expect, it } from 'vitest';
import { deriveEtag } from './etag';

describe('deriveEtag', () => {
	it('is quoted, per RFC 7232', () => {
		const etag = deriveEtag('regen-1', '/api/v1/sources');
		expect(etag.startsWith('"')).toBe(true);
		expect(etag.endsWith('"')).toBe(true);
	});

	it('is stable for the same regeneration id and path', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources');
		const b = deriveEtag('regen-1', '/api/v1/sources');
		expect(a).toBe(b);
	});

	it('changes when the regeneration id changes', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources');
		const b = deriveEtag('regen-2', '/api/v1/sources');
		expect(a).not.toBe(b);
	});

	it('changes when the path changes', () => {
		const a = deriveEtag('regen-1', '/api/v1/sources');
		const b = deriveEtag('regen-1', '/api/v1/businesses');
		expect(a).not.toBe(b);
	});
});
