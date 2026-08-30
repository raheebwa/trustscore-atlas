<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { onMount } from 'svelte';
	import { boundsOf, decodeTopology, districtKey, projectRing } from '$lib/topojson';
	import type { BoundaryFeature } from '$lib/topojson';
	import Callout from './Callout.svelte';
	import Skeleton from './Skeleton.svelte';

	/**
	 * The pack's own map, shaded by how many businesses each area holds.
	 *
	 * The ramp runs from the page's ink to its gold, five steps, because a reader compares areas
	 * against each other rather than reading an absolute value off a colour. An area with no
	 * matching business is hatched, the same mark the bars use for "nothing here", never the
	 * lightest shade, which would read as "a few".
	 *
	 * The map is decoration for the counts, not the source of them: every area is also a row in
	 * the bar list beside it, so a pack with no map (or a failed fetch) loses nothing but the
	 * picture.
	 */
	let {
		asset,
		object,
		attribution,
		counts,
		selected,
		hrefFor,
		label
	}: {
		asset: string;
		object: string;
		attribution?: string;
		counts: { key: string; count: number }[];
		selected?: string | null;
		hrefFor: (name: string) => string;
		label: string;
	} = $props();

	const SIZE = 600;
	const RAMP = ['#dfd3bb', '#b9a98d', '#8d7f6a', '#4c5a72', '#0b1e3f'];

	let features = $state<BoundaryFeature[]>([]);
	let failed = $state(false);
	let loading = $state(true);

	onMount(async () => {
		try {
			const response = await fetch(`/boundaries/${asset}`);
			if (!response.ok) throw new Error(String(response.status));
			features = decodeTopology(await response.json(), object);
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	});

	const byKey = $derived(new Map(counts.map((row) => [districtKey(row.key), row.count])));
	const bounds = $derived(features.length > 0 ? boundsOf(features) : null);

	/**
	 * Quantile breaks rather than an even or logarithmic scale. One district holds three quarters
	 * of the businesses in this pack, so any scale anchored on the maximum paints every other
	 * district the same colour and the map says nothing. Ranking spreads the shades across the
	 * areas that actually differ, and the legend says "fewer" and "more" rather than pretending
	 * the colours are values.
	 */
	const breaks = $derived.by(() => {
		const values = counts
			.map((row) => row.count)
			.filter((count) => count > 0)
			.sort((a, b) => a - b);
		if (values.length === 0) return [];
		return RAMP.slice(1).map(
			(_, index) => values[Math.floor(((index + 1) / RAMP.length) * (values.length - 1))]
		);
	});

	function fill(count: number | undefined): string {
		if (!count) return 'url(#atlas-map-empty)';
		let step = 0;
		while (step < breaks.length && count > breaks[step]) step += 1;
		return RAMP[Math.min(RAMP.length - 1, step)];
	}
</script>

{#if loading}
	<Skeleton variant="block" label="Loading the map" />
{:else if failed}
	<Callout tone="warning" title="The map did not load">
		Every area is listed beside it with its own count, so nothing is missing but the picture.
	</Callout>
{:else if bounds}
	<figure class="flex flex-col gap-2">
		<svg viewBox="0 0 {SIZE} {SIZE}" class="w-full" role="group" aria-label={label}>
			<defs>
				<pattern id="atlas-map-empty" width="6" height="6" patternUnits="userSpaceOnUse">
					<rect width="6" height="6" fill="var(--color-surface)" />
					<path d="M0,6 L6,0" stroke="var(--color-ink-faint)" stroke-width="1" />
				</pattern>
			</defs>
			{#each features as feature (feature.pcode ?? feature.name)}
				{@const count = byKey.get(districtKey(feature.name))}
				{@const isSelected = !!selected && districtKey(selected) === districtKey(feature.name)}
				<a
					href={hrefFor(feature.name ?? '')}
					aria-label={`${feature.name}: ${(count ?? 0).toLocaleString()} businesses`}
					class="outline-none focus-visible:[&>path]:stroke-accent focus-visible:[&>path]:stroke-[3]"
				>
					<path
						d={feature.rings.map((ring) => projectRing(ring, bounds, SIZE)).join('')}
						fill={fill(count)}
						fill-rule="evenodd"
						stroke={isSelected ? 'var(--color-accent)' : 'var(--color-border-strong)'}
						stroke-width={isSelected ? 2.5 : 0.7}
						class="transition-[fill] duration-120 hover:fill-accent"
					>
						<title>{feature.name}: {(count ?? 0).toLocaleString()}</title>
					</path>
				</a>
			{/each}
		</svg>
		<figcaption class="flex flex-col gap-2">
			<ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-muted">
				<li>fewer</li>
				{#each RAMP as shade (shade)}
					<li
						class="inline-block h-3 w-6 rounded-xs border border-border"
						style={`background: ${shade}`}
					></li>
				{/each}
				<li>more</li>
				<li class="ml-2 flex items-center gap-1.5">
					<span class="inline-block h-3 w-6 rounded-xs border border-border hatch"></span>
					none matched
				</li>
			</ul>
			{#if attribution}<p class="text-2xs text-ink-muted">{attribution}</p>{/if}
		</figcaption>
	</figure>
{/if}
