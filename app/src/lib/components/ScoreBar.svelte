<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { formatScoreSentence } from '$lib/format';
	import { scoreSegments, widthOf } from '$lib/measures';
	import type { ScoreSummary } from '$lib/types';

	/**
	 * One rubric as three quantities on a single track: earned in solid ink, checkable but not
	 * earned in a wash of the same ink, and unknown as a hatch. Colour would make the unknown mass
	 * look like a value; the hatch says nobody has looked yet, and it survives a black and white
	 * printout of the paper file beside the laptop.
	 */
	let {
		score,
		compact = false
	}: {
		score: Pick<
			ScoreSummary,
			'rubric' | 'value' | 'max' | 'checkable' | 'unknown' | 'unknown_predicates'
		>;
		compact?: boolean;
	} = $props();

	const segments = $derived(scoreSegments(score));
	const sentence = $derived(formatScoreSentence(score));
	const label = $derived(
		score.rubric.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	);
</script>

<figure class="flex flex-col gap-1" aria-label={sentence}>
	{#if !compact}
		<figcaption class="flex items-baseline justify-between gap-3">
			<span class="text-xs font-medium text-ink-muted">{label}</span>
			<span class="tnum text-base text-ink">
				<span class="font-display text-lg">{score.value}</span>
				<span class="text-ink-muted">
					of {score.checkable} checkable{score.unknown > 0 ? ` · ${score.unknown} unknown` : ''}
				</span>
			</span>
		</figcaption>
	{/if}
	<div
		class="flex h-3 w-full overflow-hidden rounded-sm border border-border bg-surface"
		role="img"
		aria-label={sentence}
	>
		<div
			class="h-full bg-score-earned transition-[width] duration-240 ease-[cubic-bezier(.2,0,0,1)]"
			style={`width: ${widthOf(segments.earned)}`}
		></div>
		<div class="h-full bg-score-unearned" style={`width: ${widthOf(segments.unearned)}`}></div>
		<div class="h-full hatch" style={`width: ${widthOf(segments.unknown)}`}></div>
	</div>
	{#if compact}
		<p class="tnum text-2xs text-ink-muted">{label} {score.value}/{score.max}</p>
	{/if}
</figure>
