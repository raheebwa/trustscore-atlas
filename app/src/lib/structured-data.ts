// SPDX-License-Identifier: Apache-2.0
/**
 * What a record says about itself to a reader that is not a person.
 *
 * The block carries only what the registers published and the page already shows: the name, the
 * identifiers a reader could quote back to the register that issued them, where the record says
 * the business is, and the address of the record itself. A synthetic key, which is our own handle
 * for a register row rather than anything the register issued, is left out for the same reason the
 * page leaves it out of "identifiers on file": quoting it at a register would mean nothing there.
 *
 * Every "<" is escaped as <, which JSON readers decode identically, so a business name
 * carrying a closing script tag cannot end the block it is embedded in.
 */

import type { BusinessRecordResponse } from '$lib/types';

export function organizationJsonLd(record: BusinessRecordResponse, origin: string): string {
	const identifiers = record.identifiers
		.filter((entry) => !entry.synthetic)
		.map((entry) => ({
			'@type': 'PropertyValue',
			propertyID: entry.scheme,
			value: entry.value
		}));

	const address = {
		'@type': 'PostalAddress',
		...(record.division ? { addressLocality: record.division } : {}),
		...(record.district ? { addressRegion: record.district } : {}),
		addressCountry: record.country
	};

	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: record.canonical_name,
		url: `${origin}/b/${encodeURIComponent(record.atlas_id)}`,
		...(identifiers.length > 0 ? { identifier: identifiers } : {}),
		// A record with no published location says so by carrying only the country.
		address
	}).replaceAll('<', '\\u003c');
}
