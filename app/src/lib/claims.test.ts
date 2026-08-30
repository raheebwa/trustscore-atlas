import { describe, expect, it } from 'vitest';
import {
	buildClaimConfirmationText,
	createClaimConfirmationToken,
	hashClaimConfirmationToken
} from './claims';

describe('buildClaimConfirmationText', () => {
	it('shows every value that will be recorded and distinguishes a request from a verified claim', () => {
		expect(
			buildClaimConfirmationText({
				atlasId: 'atlas-example-1',
				canonicalName: 'Example Hardware Supplies Ltd',
				claimantRole: 'authorised representative'
			})
		).toBe(
			'Store this claim request?\natlas_id: atlas-example-1\ncanonical name: Example Hardware Supplies Ltd\nclaimant role: authorised representative\nThis will store a claim request, not a verified claim.'
		);
	});
});

describe('claim confirmation tokens', () => {
	it('hashes tokens with SHA-256', async () => {
		expect(await hashClaimConfirmationToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('creates unguessable URL-safe token values', () => {
		const first = createClaimConfirmationToken();
		const second = createClaimConfirmationToken();

		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(second).toMatch(/^[a-f0-9]{64}$/);
		expect(first).not.toBe(second);
	});
});
