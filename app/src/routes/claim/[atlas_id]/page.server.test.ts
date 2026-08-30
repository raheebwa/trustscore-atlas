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
