// SPDX-License-Identifier: Apache-2.0
export const CLAIM_VERIFICATION_STEPS = [
	'Place a verification string on the registered website or official social profile.',
	'Reply from an email address on the domain named in a register.',
	'Start a per-record confirmation with URSB or URA when available.'
] as const;

export interface ClaimConfirmationInput {
	atlasId: string;
	canonicalName: string;
	claimantRole: string;
}

export {
	createConfirmationToken as createClaimConfirmationToken,
	hashConfirmationToken as hashClaimConfirmationToken
} from './confirmation';

export function buildClaimConfirmationText(input: ClaimConfirmationInput): string {
	return [
		'Store this claim request?',
		`atlas_id: ${input.atlasId}`,
		`canonical name: ${input.canonicalName}`,
		`claimant role: ${input.claimantRole}`,
		'This will store a claim request, not a verified claim.'
	].join('\n');
}
