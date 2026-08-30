<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { formatCoverageSentence } from '$lib/format';
	import { widthOf } from '$lib/measures';
	import type { CoverageSummary } from '$lib/types';

	/**
	 * The three nested bands a coverage sentence describes, drawn once so the methodology page can
	 * stop explaining them in prose: what applies to this pack, what has been checked of that, and
	 * what the record was found in.
	 */
	let { coverage }: { coverage: CoverageSummary } = $props();

	const applicable = $derived(Math.max(coverage.applicable.length, coverage.checked.length, 1));
	const checkedWidth = $derived(widthOf((coverage.checked.length / applicable) * 100));
	const foundWidth = $derived(widthOf((coverage.found_in.length / applicable) * 100));
</script>

<figure class="flex flex-col gap-2">
	<!-- Three bands, each labelled outside its bar: a label inside a hatched band is unreadable,
	     and the hatch is the one thing this diagram exists to explain. -->
	<div class="flex flex-col gap-1">
		<div class="flex items-center gap-3">
			<span class="w-32 shrink-0 tnum text-xs text-ink-muted"
				>applicable {coverage.applicable.length}</span
			>
			<span class="h-6 grow rounded-sm border border-border bg-surface hatch"></span>
		</div>
		<div class="flex items-center gap-3">
			<span class="w-32 shrink-0 tnum text-xs text-ink-muted"
				>checked {coverage.checked.length}</span
			>
			<span class="h-6 grow rounded-sm bg-panel">
				<span class="block h-full rounded-sm bg-score-unearned" style={`width: ${checkedWidth}`}
				></span>
			</span>
		</div>
		<div class="flex items-center gap-3">
			<span class="w-32 shrink-0 tnum text-xs text-ink-muted"
				>found in {coverage.found_in.length}</span
			>
			<span class="h-6 grow rounded-sm bg-panel">
				<span class="block h-full rounded-sm bg-score-earned" style={`width: ${foundWidth}`}></span>
			</span>
		</div>
	</div>
	<figcaption class="text-xs text-ink-muted">{formatCoverageSentence(coverage)}</figcaption>
</figure>
