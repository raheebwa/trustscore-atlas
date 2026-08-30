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

function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createClaimConfirmationToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return hex(bytes);
}

export async function hashClaimConfirmationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return hex(new Uint8Array(digest));
}

export function buildClaimConfirmationText(input: ClaimConfirmationInput): string {
	return [
		'Store this claim request?',
		`atlas_id: ${input.atlasId}`,
		`canonical name: ${input.canonicalName}`,
		`claimant role: ${input.claimantRole}`,
		'This will store a claim request, not a verified claim.'
	].join('\n');
}
