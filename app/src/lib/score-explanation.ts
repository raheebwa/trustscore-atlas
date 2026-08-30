// SPDX-License-Identifier: Apache-2.0
import type { JoinedScoreEvidenceItem } from '$lib/types';

export interface ScoreExplanationInput {
	rubric: string;
	checkable: number;
	unknown: number;
	evidence: JoinedScoreEvidenceItem[];
}

function sentenceLabel(predicate: string): string {
	const words = predicate
		.replace(/[._-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return words.length === 0 ? 'Predicate' : words[0].toUpperCase() + words.slice(1);
}

function withoutEndingPunctuation(value: string): string {
	return value.trim().replace(/[.!?]+$/g, '');
}

function sentenceReason(value: string): string {
	return value.replace(/^The\b/, 'the');
}

/** Builds deterministic score copy from evidence and score mass only. */
export function explainScore(input: ScoreExplanationInput): string {
	const sentences = input.evidence.map((item) => {
		const label = sentenceLabel(item.predicate);
		if (item.points <= 0) {
			const reason = withoutEndingPunctuation(
				item.reason ?? 'no qualifying register evidence was recorded'
			);
			return `${label} earned no points because ${sentenceReason(reason)}.`;
		}

		const statement = item.statements[0];
		const source = statement?.source ?? 'the recorded register evidence';
		const date = (item.as_of ?? statement?.asserted_at ?? 'an unknown date').slice(0, 10);
		return `${label} earned ${item.points} points from ${source} dated ${date}.`;
	});

	sentences.push(
		`${input.checkable} points were checkable and ${input.unknown} were unknown; scores are not a credit or fraud verdict.`
	);
	return sentences.join(' ');
}
