// SPDX-License-Identifier: Apache-2.0
export const CORRECTABLE_FIELDS = [
	'canonical_name',
	'name_variants',
	'sector.source_category',
	'sector.source_nature',
	'location.district',
	'location.division_or_subcounty',
	'website',
	'description'
] as const;

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
export type LinkageVerdict = 'match' | 'non_match';

export const FIELD_AUTHORITY_MESSAGE =
	'Identifiers, register statuses and licence standing can only be disputed through report_issue.';

export interface CorrectionInput {
	atlas_id: string;
	field: string;
	value: string;
	evidence_url: string;
}

export interface LinkageLabelInput {
	atlas_id: string;
	candidate_atlas_id: string;
	verdict: LinkageVerdict;
}

export interface IssueInput {
	atlas_id?: string;
	source?: string;
	description: string;
}

export function isCorrectableField(value: string): value is CorrectableField {
	return (CORRECTABLE_FIELDS as readonly string[]).includes(value);
}

export function buildCorrectionConfirmationText(input: CorrectionInput): string {
	return [
		'Store this correction request?',
		`atlas_id: ${input.atlas_id}`,
		`field: ${input.field}`,
		`value: ${input.value}`,
		`evidence URL: ${input.evidence_url}`,
		'This stores a request for review and does not change the published record.'
	].join('\n');
}

export function buildLinkageConfirmationText(input: LinkageLabelInput): string {
	return [
		'Store this linkage label?',
		`atlas_id: ${input.atlas_id}`,
		`candidate atlas_id: ${input.candidate_atlas_id}`,
		`verdict: ${input.verdict}`,
		'This stores a request for review and does not merge or separate records.'
	].join('\n');
}

export function buildIssueConfirmationText(input: IssueInput): string {
	return [
		'Store this issue report?',
		`atlas_id: ${input.atlas_id || 'not supplied'}`,
		`source: ${input.source || 'not supplied'}`,
		`description: ${input.description}`,
		'This stores a report for review and does not change the published record.'
	].join('\n');
}
