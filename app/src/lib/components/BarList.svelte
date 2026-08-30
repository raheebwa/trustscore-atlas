<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { widthOf } from '$lib/measures';

	/**
	 * A ranked breakdown as bars rather than a row of pills: the eye compares lengths far faster
	 * than it compares numbers, and every row is a link that adds its own filter.
	 */
	let {
		rows,
		limit = 12,
		unit = 'businesses',
		hrefFor
	}: {
		rows: { key: string; count: number }[];
		limit?: number;
		unit?: string;
		hrefFor?: (key: string) => string;
	} = $props();

	let expanded = $state(false);
	const max = $derived(Math.max(1, ...rows.map((row) => row.count)));
	const shown = $derived(expanded ? rows : rows.slice(0, limit));
</script>

<ul class="flex flex-col gap-1">
	{#each shown as row (row.key)}
		<li>
			<svelte:element
				this={hrefFor ? 'a' : 'div'}
				href={hrefFor ? hrefFor(row.key) : undefined}
				class="group flex items-center gap-3 rounded-sm px-1 py-1 transition-colors duration-120 hover:bg-panel"
			>
				<span class="w-40 shrink-0 truncate text-xs text-ink lg:w-56" title={row.key}
					>{row.key}</span
				>
				<span class="h-2 grow rounded-xs bg-panel">
					<span
						class="block h-full rounded-xs bg-score-earned transition-[width] duration-240 ease-[cubic-bezier(.2,0,0,1)]"
						style={`width: ${widthOf((row.count / max) * 100)}`}
					></span>
				</span>
				<span class="w-20 shrink-0 text-right tnum text-xs text-ink-muted">
					{row.count.toLocaleString()}
				</span>
			</svelte:element>
		</li>
	{/each}
</ul>

{#if rows.length > limit}
	<button
		type="button"
		class="mt-2 text-xs text-ink-muted underline transition-colors duration-120 hover:text-ink"
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Show fewer' : `Show all ${rows.length.toLocaleString()} ${unit}`}
	</button>
{/if}
