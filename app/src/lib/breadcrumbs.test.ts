// SPDX-License-Identifier: Apache-2.0
/**
 * One test per shape the trail has to take. A breadcrumb that carries a stale filter back to a
 * section, or that links the page you are already on, is worse than no breadcrumb.
 */

import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, buildCrumbs } from './breadcrumbs';

const base = { country: 'UG', countryName: 'Uganda' };

describe('buildCrumbs', () => {
	it('has nothing to say on the home page itself', () => {
		expect(buildCrumbs({ ...base, pathname: '/' })).toEqual([]);
	});

	it('names the country and the section, with the query as the current page', () => {
		const crumbs = buildCrumbs({
			...base,
			pathname: '/search',
			query: 'bank',
			filters: { district: 'KAMPALA', category: null }
		});

		expect(crumbs.map((crumb) => crumb.label)).toEqual(['Home', 'Uganda', 'Search', '"bank"']);
		expect(crumbs[2].href).toBe('/search?country=UG');
		expect(crumbs[3].href).toBeUndefined();
		expect(crumbs[3].title).toBe('district: KAMPALA');
	});

	it('drops the query when a section is opened without one', () => {
		const crumbs = buildCrumbs({ ...base, pathname: '/sources' });
		expect(crumbs.map((crumb) => crumb.label)).toEqual(['Home', 'Uganda', 'Sources']);
		expect(crumbs.at(-1)?.href).toBeUndefined();
	});

	it('puts a record under its country, and a trace under its record', () => {
		const record = buildCrumbs({
			...base,
			pathname: '/b/atl_1',
			recordId: 'atl_1',
			recordName: 'ROOFINGS LIMITED'
		});
		expect(record.map((crumb) => crumb.label)).toEqual(['Home', 'Uganda', 'ROOFINGS LIMITED']);
		expect(record.at(-1)?.href).toBeUndefined();

		const trace = buildCrumbs({
			...base,
			pathname: '/b/atl_1/trace/canonical_name',
			recordId: 'atl_1',
			recordName: 'ROOFINGS LIMITED',
			fieldLabel: 'Canonical name'
		});
		expect(trace.map((crumb) => crumb.label)).toEqual([
			'Home',
			'Uganda',
			'ROOFINGS LIMITED',
			'Canonical name'
		]);
		expect(trace[2].href).toBe('/b/atl_1');
	});

	it('puts a claim under the business it is about, not under a list of claims', () => {
		const crumbs = buildCrumbs({
			...base,
			pathname: '/claim/atl_1',
			recordId: 'atl_1',
			recordName: 'ROOFINGS LIMITED'
		});

		expect(crumbs.map((crumb) => crumb.label)).toEqual([
			'Home',
			'Uganda',
			'ROOFINGS LIMITED',
			'Claim'
		]);
		expect(crumbs[2].href).toBe('/b/atl_1');
		expect(crumbs.at(-1)?.href).toBeUndefined();
	});

	it('keeps the global tool surface out of a country', () => {
		expect(buildCrumbs({ ...base, pathname: '/tools' }).map((crumb) => crumb.label)).toEqual([
			'Home',
			'Tools'
		]);
	});

	it('truncates a name too long to sit in a trail, and keeps the whole of it in the title', () => {
		const long = 'A REGISTERED BUSINESS NAME LONG ENOUGH TO FILL THE WHOLE TRAIL LIMITED';
		const crumbs = buildCrumbs({
			...base,
			pathname: '/b/atl_1',
			recordId: 'atl_1',
			recordName: long
		});

		expect(crumbs.at(-1)?.label.length).toBeLessThan(long.length);
		expect(crumbs.at(-1)?.title).toBe(long);
	});

	it('carries the country on every link, so following one never changes the scope', () => {
		const crumbs = buildCrumbs({
			...base,
			country: 'KE',
			countryName: 'Kenya',
			pathname: '/explore',
			area: 'Nairobi'
		});

		expect(crumbs[0].href).toBe('/?country=KE');
		expect(crumbs[1].href).toBe('/?country=KE');
		expect(crumbs[2].href).toBe('/explore?country=KE');
		expect(crumbs.at(-1)).toEqual({ label: 'Nairobi' });
	});
});

describe('breadcrumbJsonLd', () => {
	it('says the same thing to a crawler that the page says to a reader', () => {
		const crumbs = buildCrumbs({ ...base, pathname: '/search', query: 'bank' });
		const parsed = JSON.parse(breadcrumbJsonLd(crumbs, 'https://atlas.example.invalid'));

		expect(parsed['@type']).toBe('BreadcrumbList');
		expect(parsed.itemListElement).toHaveLength(4);
		expect(parsed.itemListElement[0]).toMatchObject({
			position: 1,
			name: 'Home',
			item: 'https://atlas.example.invalid/?country=UG'
		});
		expect(parsed.itemListElement[3].item).toBeUndefined();
	});
});
