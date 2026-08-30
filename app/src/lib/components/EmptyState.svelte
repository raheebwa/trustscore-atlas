<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	/**
	 * An empty screen teaches the interface: it says what would fill it and gives two real values
	 * to try, because "no results" leaves a first-time visitor with nowhere to go.
	 */
	let {
		title,
		body,
		examples = [],
		icon,
		actions
	}: {
		title: string;
		body: string;
		// A resolved route, optionally carrying a query: an example search is only useful with one.
		examples?: { label: string; href: ResolvedPathname | `${ResolvedPathname}?${string}` }[];
		icon?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
	{#if icon}<span class="text-ink-muted">{@render icon()}</span>{/if}
	<p class="text-lg font-semibold text-ink">{title}</p>
	<p class="max-w-prose text-base text-ink-muted">{body}</p>
	{#if examples.length > 0}
		<ul class="flex flex-wrap gap-2">
			{#each examples as example (example.href)}
				<li>
					<a
						href={example.href}
						class="inline-flex h-8 items-center rounded-md border border-border bg-panel px-3 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
					>
						{example.label}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	{#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
</div>
