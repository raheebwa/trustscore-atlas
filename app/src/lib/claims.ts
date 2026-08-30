// SPDX-License-Identifier: Apache-2.0
/**
 * How long a claim stays actionable. It bounds both the link a page claimant is sent away with and
 * the challenge issued against it, so the promise on the page ("it stops working when the claim
 * window closes") is one number rather than two that drift apart.
 */
export const CLAIM_WINDOW_DAYS = 7;

/**
 * The routes that exist. A list that named a route Atlas does not offer would be read as a promise
 * by the one claimant it mattered to, so it names only what a claimant can actually do today.
 */
export const CLAIM_VERIFICATION_STEPS = [
	'Publish a short string Atlas gives you on your business website. Publishing it proves you control that site.',
	'Or, where a register published a website for the record, open a link Atlas mails to an address at that domain.',
	'A licence or a letter can be attached to the claim afterwards. A document supports a maintainer reviewing it and never verifies a claim on its own.'
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
