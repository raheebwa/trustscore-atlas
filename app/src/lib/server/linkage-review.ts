/**
 * Linkage review for maintainers: name candidates in the review band, both businesses side
 * by side, and an append-only verdict per pair. The pipeline compiles verdicts into the
 * canonical labels file at the next regeneration; nothing here merges a record.
 */

import { OpsError } from './ops';

export { OpsError };

export const REVIEW_BAND: [number, number] = [0.8, 0.95];
const REVIEW_LIMIT = 50;

export interface ReviewSide {
	atlas_id: string;
	name: string;
	district: string | null;
	sector: string | null;
	found_in: string[];
}

export interface ReviewCandidate {
	atlas_id_a: string;
	atlas_id_b: string;
	match_probability: number;
	comparison: Record<string, unknown>;
	a: ReviewSide;
	b: ReviewSide;
}

interface CandidateRow {
	atlas_id_a: string;
	atlas_id_b: string;
	match_probability: number;
	comparison: string;
	name_a: string;
	name_b: string;
	district_a: string | null;
	district_b: string | null;
	sector_a: string | null;
	sector_b: string | null;
	found_in_a: string;
	found_in_b: string;
}

function parseList(json: string | null): string[] {
	try {
		const parsed: unknown = JSON.parse(json ?? '[]');
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

function parseObject(json: string | null): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(json ?? '{}');
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export async function listReviewCandidates(
	db: D1Database,
	limit = REVIEW_LIMIT
): Promise<ReviewCandidate[]> {
	const { results } = await db
		.prepare(
			`SELECT c.atlas_id_a, c.atlas_id_b, c.match_probability, c.comparison,
			   a.canonical_name AS name_a, b.canonical_name AS name_b,
			   a.district AS district_a, b.district AS district_b,
			   a.sector_category AS sector_a, b.sector_category AS sector_b,
			   json_extract(a.coverage, '$.found_in') AS found_in_a,
			   json_extract(b.coverage, '$.found_in') AS found_in_b
			 FROM linkage_candidates c
			 JOIN businesses a ON a.atlas_id = c.atlas_id_a
			 JOIN businesses b ON b.atlas_id = c.atlas_id_b
			 WHERE c.match_probability >= ? AND c.match_probability < ?
			   AND NOT EXISTS (
			     SELECT 1 FROM maintainer_labels m
			     WHERE (m.atlas_id = c.atlas_id_a AND m.candidate_atlas_id = c.atlas_id_b)
			        OR (m.atlas_id = c.atlas_id_b AND m.candidate_atlas_id = c.atlas_id_a))
			 ORDER BY c.match_probability DESC, c.atlas_id_a, c.atlas_id_b
			 LIMIT ?`
		)
		.bind(REVIEW_BAND[0], REVIEW_BAND[1], limit)
		.all<CandidateRow>();
	return (results ?? []).map((row) => ({
		atlas_id_a: row.atlas_id_a,
		atlas_id_b: row.atlas_id_b,
		match_probability: row.match_probability,
		comparison: parseObject(row.comparison),
		a: {
			atlas_id: row.atlas_id_a,
			name: row.name_a,
			district: row.district_a,
			sector: row.sector_a,
			found_in: parseList(row.found_in_a)
		},
		b: {
			atlas_id: row.atlas_id_b,
			name: row.name_b,
			district: row.district_b,
			sector: row.sector_b,
			found_in: parseList(row.found_in_b)
		}
	}));
}

export interface MaintainerLabelInput {
	atlas_id: string;
	candidate_atlas_id: string;
	verdict: 'match' | 'non_match';
	reason: string;
	labelled_by: string;
}

export interface MaintainerLabel extends MaintainerLabelInput {
	label_id: string;
	labelled_at: string;
}

export async function recordMaintainerLabel(
	db: D1Database,
	input: MaintainerLabelInput
): Promise<MaintainerLabel> {
	const reason = input.reason.trim();
	if (!reason) throw new OpsError('A reason is required.');
	if (input.verdict !== 'match' && input.verdict !== 'non_match') {
		throw new OpsError('Verdict must be match or non_match.');
	}
	if (!input.atlas_id || !input.candidate_atlas_id || input.atlas_id === input.candidate_atlas_id) {
		throw new OpsError('A label needs two different businesses.');
	}
	if (!input.labelled_by.trim()) throw new OpsError('The labelling maintainer is unknown.');
	const known = await db
		.prepare('SELECT COUNT(*) AS n FROM businesses WHERE atlas_id IN (?, ?)')
		.bind(input.atlas_id, input.candidate_atlas_id)
		.first<{ n: number }>();
	if ((known?.n ?? 0) !== 2)
		throw new OpsError('Both businesses must exist in the live regeneration.');

	const label: MaintainerLabel = {
		...input,
		reason,
		label_id: `mlabel_${crypto.randomUUID().replaceAll('-', '')}`,
		labelled_at: new Date().toISOString()
	};
	await db
		.prepare(
			`INSERT INTO maintainer_labels
			 (label_id, atlas_id, candidate_atlas_id, verdict, reason, labelled_by, labelled_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			label.label_id,
			label.atlas_id,
			label.candidate_atlas_id,
			label.verdict,
			label.reason,
			label.labelled_by,
			label.labelled_at
		)
		.run();
	return label;
}
