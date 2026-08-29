import { describe, expect, it } from 'vitest';
import { buildClaimConfirmationText } from './claims';

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
