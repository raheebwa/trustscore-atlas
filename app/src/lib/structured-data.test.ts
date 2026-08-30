// SPDX-License-Identifier: Apache-2.0
/**
 * The block is read by machines that will quote it back at people, so it may carry only what the
 * registers published: no synthetic key, no invented address, and nothing that could end the
 * script element it sits in.
 */

import { describe, expect, it } from 'vitest';
import { organizationJsonLd } from './structured-data';
import type { BusinessRecordResponse } from '$lib/types';

const record = {
	atlas_id: 'atl_example',
	country: 'UG',
	canonical_name: 'Example Hardware Supplies Ltd',
	district: 'Kampala',
	division: 'Nakawa Division',
	identifiers: [
		{ scheme: 'ug:tin', value: '1000026854', source: 'ura.vat_withholding_agents' },
		{
			scheme: 'ug:kcca_licence',
			value: '7f5f8a01',
			source: 'kcca.businesses',
			synthetic: true
		}
	]
} as unknown as BusinessRecordResponse;

describe('organizationJsonLd', () => {
	it('carries the name, the record address and the identifiers a register issued', () => {
		const parsed = JSON.parse(organizationJsonLd(record, 'https://atlas.example.invalid'));

		expect(parsed).toMatchObject({
			'@type': 'Organization',
			name: 'Example Hardware Supplies Ltd',
			url: 'https://atlas.example.invalid/b/atl_example',
			address: {
				'@type': 'PostalAddress',
				addressLocality: 'Nakawa Division',
				addressRegion: 'Kampala',
				addressCountry: 'UG'
			}
		});
		expect(parsed.identifier).toEqual([
			{ '@type': 'PropertyValue', propertyID: 'ug:tin', value: '1000026854' }
		]);
	});

	it('leaves out a location no register published rather than inventing one', () => {
		const parsed = JSON.parse(
			organizationJsonLd(
				{ ...record, district: null, division: null } as unknown as BusinessRecordResponse,
				'https://atlas.example.invalid'
			)
		);

		expect(parsed.address).toEqual({ '@type': 'PostalAddress', addressCountry: 'UG' });
	});

	it('omits the identifier list entirely when every key is one of ours', () => {
		const parsed = JSON.parse(
			organizationJsonLd(
				{ ...record, identifiers: [record.identifiers[1]] } as unknown as BusinessRecordResponse,
				'https://atlas.example.invalid'
			)
		);

		expect(parsed.identifier).toBeUndefined();
	});

	it('cannot end the script element it is written into', () => {
		const written = organizationJsonLd(
			{
				...record,
				canonical_name: 'Example </script><script>alert(1)</script> Ltd'
			} as BusinessRecordResponse,
			'https://atlas.example.invalid'
		);

		expect(written).not.toContain('</script>');
		expect(JSON.parse(written).name).toBe('Example </script><script>alert(1)</script> Ltd');
	});
});
