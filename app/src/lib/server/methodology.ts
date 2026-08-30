/**
 * The methodology page reads what the serving database was scored with: the pipeline
 * writes the rubric definitions, each pack's bindings and precedence contract, and the
 * linkage thresholds into meta under `methodology` at every regeneration.
 */

import { getMetaValue } from './atlas';

export interface RubricPredicate {
	id: string;
	points: number;
	description: string;
	[extra: string]: unknown;
}

export interface PublishedRubric {
	name: string;
	version: number;
	title: string;
	question: string;
	max: number;
	licence: string;
	predicates: RubricPredicate[];
}

export interface PublishedPack {
	name?: string;
	identifier_schemes?: Record<string, { title?: string; issuer?: string; issuer_unique?: boolean }>;
	precedence: Record<string, number>;
	bindings: Record<string, Record<string, Record<string, unknown>>>;
}

export interface PublishedMethodology {
	rubrics: PublishedRubric[];
	packs: Record<string, PublishedPack>;
	linkage: {
		model_version?: string;
		candidate_threshold: number;
		review_band: [number, number];
		rule?: string;
	};
}

export interface LinkageCounts {
	candidate: number;
	review: number;
	likely: number;
	labelled_matches: number;
	identifier_merges: number;
}

export interface Methodology {
	published: PublishedMethodology | null;
	linkage: LinkageCounts;
}

function parsePublished(value: string | null): PublishedMethodology | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object') return null;
		const candidate = parsed as PublishedMethodology;
		if (!Array.isArray(candidate.rubrics) || typeof candidate.packs !== 'object') return null;
		return candidate;
	} catch {
		return null;
	}
}

export async function getMethodology(db: D1Database): Promise<Methodology> {
	const [published, bands, aliases] = await Promise.all([
		getMetaValue(db, 'methodology'),
		db
			.prepare(
				`SELECT CASE WHEN match_probability >= 0.95 THEN 'likely'
				 WHEN match_probability >= 0.8 THEN 'review' ELSE 'candidate' END AS band,
				 COUNT(*) AS n FROM linkage_candidates GROUP BY band`
			)
			.bind()
			.all<{ band: string; n: number }>(),
		db
			.prepare('SELECT reason, COUNT(*) AS n FROM aliases GROUP BY reason')
			.bind()
			.all<{ reason: string; n: number }>()
	]);
	const bandCounts = new Map((bands.results ?? []).map((row) => [row.band, row.n]));
	let labelled = 0;
	let identifiers = 0;
	for (const row of aliases.results ?? []) {
		if (row.reason === 'label:match') labelled += row.n;
		else identifiers += row.n;
	}
	return {
		published: parsePublished(published),
		linkage: {
			candidate: bandCounts.get('candidate') ?? 0,
			review: bandCounts.get('review') ?? 0,
			likely: bandCounts.get('likely') ?? 0,
			labelled_matches: labelled,
			identifier_merges: identifiers
		}
	};
}
