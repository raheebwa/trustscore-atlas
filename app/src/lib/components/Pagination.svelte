<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	/**
	 * Cursor paging says where you are before it offers where to go: "showing 20 of 1,284" is the
	 * part a person reads, and the next link is inert when there is nothing after this page.
	 */
	let {
		returned,
		totalCount,
		nextHref,
		previousHref
	}: {
		returned: number;
		totalCount: number;
		nextHref?: string | null;
		previousHref?: string | null;
	} = $props();
</script>

<nav class="flex items-center justify-between gap-4 pt-4" aria-label="Result pages">
	<p class="text-xs text-ink-muted">
		Showing <span class="tnum">{returned.toLocaleString()}</span> of
		<span class="tnum">{totalCount.toLocaleString()}</span>
	</p>
	<div class="flex gap-2">
		{#if previousHref}
			<a
				href={previousHref}
				class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-3 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
			>
				<ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" /> Previous
			</a>
		{/if}
		{#if nextHref}
			<a
				href={nextHref}
				class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-3 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
			>
				Next <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
			</a>
		{/if}
	</div>
</nav>
