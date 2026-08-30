<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Crumb } from '$lib/breadcrumbs';

	/**
	 * Where this page sits. On a phone the whole trail is noise, so it collapses to one way back
	 * plus where you are, which is the only part of a trail a small screen has room to use.
	 */
	let { crumbs }: { crumbs: Crumb[] } = $props();

	const current = $derived(crumbs.at(-1));
	const parent = $derived([...crumbs].reverse().find((crumb) => crumb.href));
</script>

{#if crumbs.length > 1}
	<nav aria-label="Breadcrumb" class="text-xs text-ink-muted">
		<!-- The full trail from the medium breakpoint up. -->
		<ol class="hidden flex-wrap items-center gap-1 md:flex">
			{#each crumbs as crumb, index (crumb.label + index)}
				<li class="flex min-w-0 items-center gap-1">
					{#if index > 0}
						<ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" class="shrink-0" />
					{/if}
					{#if crumb.href}
						<a
							href={crumb.href}
							title={crumb.title}
							class="truncate underline transition-colors duration-120 hover:text-ink"
							>{crumb.label}</a
						>
					{:else}
						<span class="truncate text-ink" title={crumb.title} aria-current="page"
							>{crumb.label}</span
						>
					{/if}
				</li>
			{/each}
		</ol>

		<!-- One way back, and where you are, below it. -->
		<p class="flex items-center gap-2 md:hidden">
			{#if parent}
				<a
					href={parent.href}
					class="inline-flex items-center gap-1 underline transition-colors duration-120 hover:text-ink"
				>
					<ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
					Back to {parent.label}
				</a>
			{/if}
			{#if current && current !== parent}
				<span class="truncate text-ink" title={current.title} aria-current="page"
					>{current.label}</span
				>
			{/if}
		</p>
	</nav>
{/if}
