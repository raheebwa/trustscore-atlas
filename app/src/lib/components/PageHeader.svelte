<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';

	let {
		title,
		lede,
		meta = [],
		actions,
		serif = false
	}: {
		title: string;
		lede?: string;
		meta?: string[];
		actions?: Snippet;
		serif?: boolean;
	} = $props();
</script>

<header class="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
	<div class="flex min-w-0 flex-col gap-2">
		<h1 class="text-2xl font-semibold text-ink {serif ? 'font-display' : ''}">{title}</h1>
		{#if lede}<p class="max-w-prose text-base text-ink-muted">{lede}</p>{/if}
		{#if meta.length > 0}
			<p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
				{#each meta as item (item)}<span class="tnum">{item}</span>{/each}
			</p>
		{/if}
	</div>
	{#if actions}<div class="flex shrink-0 gap-2">{@render actions()}</div>{/if}
</header>
