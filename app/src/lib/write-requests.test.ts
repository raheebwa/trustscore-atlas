import { describe, expect, it } from 'vitest';
import {
	CORRECTABLE_FIELDS,
	FIELD_AUTHORITY_MESSAGE,
	buildCorrectionConfirmationText,
	buildIssueConfirmationText,
	buildLinkageConfirmationText
} from './write-requests';

describe('write request confirmation text', () => {
	it('lists only the correction fields within operator authority', () => {
		expect(CORRECTABLE_FIELDS).toEqual([
			'canonical_name',
			'name_variants',
			'sector.source_category',
			'sector.source_nature',
			'location.district',
			'location.division_or_subcounty',
			'website',
			'description'
		]);
		expect(FIELD_AUTHORITY_MESSAGE).toBe(
			'Identifiers, register statuses and licence standing can only be disputed through report_issue.'
		);
	});

	it('shows every correction value exactly', () => {
		expect(
			buildCorrectionConfirmationText({
				atlas_id: 'atlas-example-1',
				field: 'website',
				value: 'https://example.org/example-workshop',
				evidence_url: 'https://example.org/evidence/example-workshop'
			})
		).toContain(
			'atlas_id: atlas-example-1\nfield: website\nvalue: https://example.org/example-workshop\nevidence URL: https://example.org/evidence/example-workshop'
		);
	});

	it('shows every linkage and issue value exactly', () => {
		expect(
			buildLinkageConfirmationText({
				atlas_id: 'atlas-example-1',
				candidate_atlas_id: 'atlas-example-2',
				verdict: 'match'
			})
		).toContain('atlas_id: atlas-example-1\ncandidate atlas_id: atlas-example-2\nverdict: match');
		expect(
			buildIssueConfirmationText({
				atlas_id: 'atlas-example-1',
				description: 'The example record has an incomplete date.'
			})
		).toContain(
			'atlas_id: atlas-example-1\nsource: not supplied\ndescription: The example record has an incomplete date.'
		);
	});
});
