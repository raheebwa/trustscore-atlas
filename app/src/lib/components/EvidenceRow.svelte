<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import type { ScoreEvidenceItem } from '$lib/types';
	import { formatFieldLabel } from '$lib/format';

	/**
	 * One line of a score's working: what was asked, what it was worth, and whether the answer
	 * came from a register, was checked and not found, or has not been checked at all. The third
	 * case gets the hatch mark rather than a zero, because a zero reads as a finding.
	 */
	let { item, traceHref }: { item: ScoreEvidenceItem; traceHref?: string } = $props();

	const unknown = $derived(item.points === 0 && (item.reason ?? '').includes('not checked'));
</script>

<div class="flex items-center gap-3 border-b border-border py-2 last:border-0">
	<span class="shrink-0">
		{#if item.points > 0}
			<Check size={16} strokeWidth={1.5} class="text-success-ink" aria-label="earned" />
		{:else if unknown}
			<span
				class="inline-block h-4 w-4 rounded-xs border border-border hatch"
				aria-label="not yet checked"
			></span>
		{:else}
			<X size={16} strokeWidth={1.5} class="text-ink-muted" aria-label="not earned" />
		{/if}
	</span>
	<span class="grow text-base text-ink">{formatFieldLabel(item.predicate)}</span>
	{#if item.reason}<span class="text-xs text-ink-muted">{item.reason}</span>{/if}
	<span class="w-12 shrink-0 text-right tnum text-base text-ink">{item.points}</span>
	{#if traceHref}
		<a href={traceHref} class="shrink-0 text-xs text-ink-muted underline hover:text-ink">trace</a>
	{/if}
</div>
