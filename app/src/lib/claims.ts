// SPDX-License-Identifier: Apache-2.0
/**
 * How long a claim stays actionable. It bounds both the link a page claimant is sent away with and
 * the challenge issued against it, so the promise on the page ("it stops working when the claim
 * window closes") is one number rather than two that drift apart.
 */
export const CLAIM_WINDOW_DAYS = 7;

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
