<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { formatCoverageSentence } from '$lib/format';
	import { coverageSegments, widthOf } from '$lib/measures';
	import type { CoverageSummary } from '$lib/types';

	/**
	 * How much of this country's register set has actually been looked at for this record. The
	 * sentence under the bar is the same one the API and the tools return, so a reader and a model
	 * are told the same thing in the same words.
	 */
	let {
		coverage,
		summary,
		showLegend = false
	}: { coverage: CoverageSummary; summary?: string; showLegend?: boolean } = $props();

	const segments = $derived(coverageSegments(coverage));
	const sentence = $derived(summary ?? formatCoverageSentence(coverage));
</script>

<figure class="flex flex-col gap-1">
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
	<figcaption class="text-xs text-ink-muted">{sentence}</figcaption>
</figure>

{#if showLegend}
	<ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
		<li class="flex items-center gap-1.5">
			<span class="inline-block h-2 w-4 rounded-xs bg-score-earned"></span> found in
		</li>
		<li class="flex items-center gap-1.5">
			<span class="inline-block h-2 w-4 rounded-xs bg-score-unearned"></span> checked, not found
		</li>
		<li class="flex items-center gap-1.5">
			<span class="inline-block h-2 w-4 rounded-xs border border-border hatch"></span> not yet checked
		</li>
	</ul>
{/if}
