// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { hashClaimConfirmationToken } from '$lib/claims';
import { load } from './+page.server';

interface ConfirmationRow {
	claim_id: string;
	atlas_id: string;
	canonical_name: string;
	claimant_role: string;
	requested_at: string;
	status: string;
	expires_at: string;
}

const baseRow: ConfirmationRow = {
	claim_id: 'claim_example',
	atlas_id: 'atlas-example-1',
	canonical_name: 'Example Hardware Supplies Ltd',
	claimant_role: 'authorised representative',
	requested_at: '2026-08-30T10:00:00.000Z',
	status: 'unconfirmed',
	expires_at: '2999-01-01T00:00:00.000Z'
};

async function loadConfirmation(row: ConfirmationRow, token = 'example-page-token') {
	const bindings: unknown[][] = [];
	const db = {
		prepare: () => ({
			bind: (...values: unknown[]) => ({
				first: async () => {
					bindings.push(values);
					return row;
				}
			})
		})
	} as unknown as D1Database;
	const data = await load({
		platform: { env: { DB: db } },
		params: { atlas_id: row.claim_id },
		url: new URL(`https://atlas.example.invalid/claim/${row.claim_id}?token=${token}`)
	} as never);
	if (!data) throw new Error('Expected claim confirmation data');
	return { data, bindings, token };
}

describe('claim confirmation page loader', () => {
	it('shows an unexpired legacy request as unconfirmed with the exact record', async () => {
		const { data, bindings, token } = await loadConfirmation({
			...baseRow,
			status: 'requested'
		});

		expect(data.confirmation).toMatchObject({
			state: 'unconfirmed',
			record: {
				claim_id: 'claim_example',
				atlas_id: 'atlas-example-1',
				canonical_name: 'Example Hardware Supplies Ltd',
				claimant_role: 'authorised representative',
				requested_at: '2026-08-30T10:00:00.000Z'
			}
		});
		expect(bindings[0]).toEqual(['claim_example', await hashClaimConfirmationToken(token)]);
	});

	it('marks an expired unconfirmed request plainly', async () => {
		const { data } = await loadConfirmation({
			...baseRow,
			expires_at: '2000-01-01T00:00:00.000Z'
		});

		expect(data.confirmation?.state).toBe('expired');
		expect(data.confirmation?.record?.atlas_id).toBe('atlas-example-1');
	});

	it('marks an already confirmed request plainly even after its former expiry time', async () => {
		const { data } = await loadConfirmation({
			...baseRow,
			status: 'confirmed',
			expires_at: '2000-01-01T00:00:00.000Z'
		});

		expect(data.confirmation?.state).toBe('confirmed');
		expect(data.confirmation?.record?.claimant_role).toBe('authorised representative');
	});
});

/**
 * The verification link is a different shape from the confirmation link: it names the business in
 * the path and carries the claim beside the token, because the claimant has no account to return
 * to. These tests hold the two things that shape has to keep true: the link opens only the claim
 * it names, and only on the business that claim is for.
 */
const VERIFICATION_TOKEN = 'example-verification-token';

interface StoredClaim {
	claim_id: string;
	atlas_id: string;
	status: string;
	expires_at: string | null;
	verified_at: string | null;
	verified_domain: string | null;
	verification_method: string | null;
}

interface StoredChallenge {
	challenge_id: string;
	method: string;
	target: string;
	challenge_value: string | null;
	expires_at: string;
	attempts: number;
	outcome: string | null;
	consumed_at: string | null;
}

const storedClaim: StoredClaim = {
	claim_id: 'claim_example',
	atlas_id: 'atlas-example-1',
	status: 'confirmed',
	expires_at: '2999-01-01T00:00:00.000Z',
	verified_at: null,
	verified_domain: null,
	verification_method: null
};

const storedChallenge: StoredChallenge = {
	challenge_id: 'chal_1',
	method: 'website_string',
	target: 'https://example.co.ug',
	challenge_value: 'atlas-verify-abcdefgh12345678',
	expires_at: '2999-01-01T00:00:00.000Z',
	attempts: 2,
	outcome: 'string_not_found',
	consumed_at: null
};

/**
 * A database that answers from what it was bound with. A fake that ignores its bindings cannot
 * fail when the query stops constraining what it should, which is exactly the class of defect
 * these tests exist to catch.
 */
async function loadVerificationLink(
	options: {
		claim?: Partial<StoredClaim>;
		challenge?: Partial<StoredChallenge> | null;
		documents?: { evidence_id: string; content_type: string; uploaded_at: string }[];
		published?: string[];
		token?: string;
		pathAtlasId?: string;
	} = {}
) {
	const claim = { ...storedClaim, ...options.claim };
	const challenge =
		options.challenge === null ? null : { ...storedChallenge, ...options.challenge };
	const storedHash = await hashClaimConfirmationToken(VERIFICATION_TOKEN);

	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				all: async () => ({
					results: sql.includes('FROM statements')
						? (options.published ?? []).map((value) => ({ value }))
						: sql.includes('FROM claim_evidence')
							? bindings[0] === claim.claim_id
								? (options.documents ?? [])
								: []
							: []
				}),
				first: async () => {
					if (sql.includes('FROM claim_challenges')) {
						return bindings[0] === claim.claim_id ? challenge : null;
					}
					if (sql.includes('FROM claims')) {
						return bindings[0] === claim.claim_id && bindings[1] === storedHash ? claim : null;
					}
					// Every business in this fake exists, so a mismatch is tested as a real other
					// business rather than as a 404 on a business that was never there.
					return typeof bindings[0] === 'string'
						? {
								atlas_id: bindings[0],
								canonical_name:
									bindings[0] === claim.atlas_id
										? 'Example Hardware Supplies Ltd'
										: 'Another Business Ltd'
							}
						: null;
				}
			})
		})
	} as unknown as D1Database;

	const query = new URLSearchParams({
		confirmation: 'complete',
		claim: claim.claim_id,
		token: options.token ?? VERIFICATION_TOKEN
	});
	const atlasId = options.pathAtlasId ?? claim.atlas_id;
	const data = await load({
		// The page reads the record's published websites, which live in the statements database.
		platform: { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } },
		params: { atlas_id: atlasId },
		url: new URL(`https://atlas.example.invalid/claim/${atlasId}?${query.toString()}`)
	} as never);
	if (!data) throw new Error('Expected claim page data');
	return data;
}

describe('claim verification panel loader', () => {
	it('reads a claim-and-token link as verification rather than as a confirmation link', async () => {
		const data = await loadVerificationLink();

		expect(data.confirmation).toBeNull();
		expect(data.confirmationComplete).toBe(true);
		expect(data.business?.canonical_name).toBe('Example Hardware Supplies Ltd');
		expect(data.verification).toMatchObject({
			claim_id: 'claim_example',
			state: 'live',
			challenge: {
				challenge_value: 'atlas-verify-abcdefgh12345678',
				target: 'https://example.co.ug',
				attempts_left: 3,
				outcome: 'string_not_found'
			}
		});
	});

	// The header names the business in the path while the panel carries the challenge. If those
	// two are never joined, a hand-edited link shows one business's name above another's claim.
	it('opens nothing when the claim belongs to a different business', async () => {
		const data = await loadVerificationLink({ pathAtlasId: 'atlas-someone-else' });

		expect(data.verification).toBeNull();
	});

	it("opens nothing for a token that is not the claim's own", async () => {
		const data = await loadVerificationLink({ token: 'not-the-token' });

		expect(data.verification).toBeNull();
	});

	it('shows a verified claim as verified rather than offering another check', async () => {
		const data = await loadVerificationLink({
			claim: { verified_at: '2026-08-30T10:00:00.000Z', verified_domain: 'example.co.ug' }
		});

		expect(data.verification?.state).toBe('verified');
		expect(data.verification?.challenge).toBeNull();
	});

	// The page says what was proved, so it has to know which proof it was: a claim verified by a
	// mailed link must not be captioned as a website whose string Atlas found.
	it('carries the method a verified claim was proved by', async () => {
		const data = await loadVerificationLink({
			claim: {
				verified_at: '2026-08-30T10:00:00.000Z',
				verified_domain: 'example.co.ug',
				verification_method: 'domain_email'
			}
		});

		expect(data.verification).toMatchObject({
			state: 'verified',
			verification_method: 'domain_email'
		});
	});

	it.each([
		['consumed', { consumed_at: '2026-08-30T10:00:00.000Z' }],
		['expired', { expires_at: '2000-01-01T00:00:00.000Z' }],
		['unreadable', { expires_at: 'not a date' }]
	])('does not offer a %s challenge as one that can still be checked', async (_label, patch) => {
		const data = await loadVerificationLink({ challenge: patch });

		expect(data.verification?.state).toBe('closed');
		expect(data.verification?.challenge).toBeNull();
	});

	it('closes the panel once the claim window has closed', async () => {
		const data = await loadVerificationLink({
			claim: { expires_at: '2000-01-01T00:00:00.000Z' }
		});

		expect(data.verification?.state).toBe('closed');
	});

	it('says there is no challenge when none was ever issued', async () => {
		const data = await loadVerificationLink({ challenge: null });

		expect(data.verification?.state).toBe('none');
	});

	it('lists the documents attached to the claim, which prove nothing on their own', async () => {
		const data = await loadVerificationLink({
			documents: [
				{
					evidence_id: 'evidence_1',
					content_type: 'application/pdf',
					uploaded_at: '2026-08-30T10:00:00.000Z'
				}
			]
		});

		expect(data.verification?.documents).toHaveLength(1);
		expect(data.verification?.documents[0]).toMatchObject({ content_type: 'application/pdf' });
	});

	// A mailed link may only go to a domain the record itself publishes, so the page is told which
	// those are rather than inviting a claimant to guess at one.
	it('names the domains a register published for the record', async () => {
		const data = await loadVerificationLink({ published: ['https://www.Example.co.ug/about'] });

		expect(data.verification?.mail_domains).toEqual(['example.co.ug']);
	});

	it('names none when no register published a website for it', async () => {
		const data = await loadVerificationLink();

		expect(data.verification?.mail_domains).toEqual([]);
	});
});
