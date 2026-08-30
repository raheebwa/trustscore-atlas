/**
 * Three Ugandan tax registers publish a citation, not a link ("URA report 13, pulled
 * 2026-05-12"), and the page was rendering every reference as a URL. 81,733 statements sat
 * behind a link that went nowhere.
 */

import { describe, expect, it } from 'vitest';
import { describeReference } from './references';

describe('describeReference', () => {
	it('links a reference that is a real web address, and names the register', () => {
		const reference = describeReference({
			source: 'kcca.businesses',
			source_ref: 'https://kcca.go.ug/sitePages/business_query.php?nature=Bakery',
			atlas_id: 'atl_1',
			field: 'canonical_name'
		});

		expect(reference.source_slug).toBe('kcca.businesses');
		expect(reference.source_url).toBe(
			'https://kcca.go.ug/sitePages/business_query.php?nature=Bakery'
		);
		expect(reference.source_ref_label).toBe('kcca.go.ug');
		expect(reference.trace_url).toBe('/b/atl_1/trace/canonical_name');
	});

	it('keeps a citation as text rather than pretending it is a link', () => {
		const reference = describeReference({
			source: 'ura.customs_agents',
			source_ref: 'URA report 13, pulled 2026-05-12',
			atlas_id: 'atl_1',
			field: 'tin'
		});

		expect(reference.source_url).toBeNull();
		expect(reference.source_ref_label).toBe('URA report 13, pulled 2026-05-12');
	});

	it('refuses a scheme that is not http or https, however it is dressed up', () => {
		for (const ref of [
			'javascript:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'file:///etc/passwd',
			'//evil.example.com',
			' '
		]) {
			expect(
				describeReference({ source: 's', source_ref: ref, atlas_id: 'a', field: 'f' }).source_url
			).toBeNull();
		}
	});

	it('escapes the identifier and the field in the trace link', () => {
		const reference = describeReference({
			source: 's',
			source_ref: null,
			atlas_id: 'atl_1/../..',
			field: 'a field'
		});

		expect(reference.trace_url).toBe('/b/atl_1%2F..%2F../trace/a%20field');
	});

	it('falls back to the slug when a register publishes no reference at all', () => {
		const reference = describeReference({
			source: 'ppda.ocds',
			source_ref: null,
			atlas_id: 'atl_1',
			field: 'canonical_name'
		});

		expect(reference.source_ref_label).toBe('ppda.ocds');
		expect(reference.source_url).toBeNull();
	});
});
