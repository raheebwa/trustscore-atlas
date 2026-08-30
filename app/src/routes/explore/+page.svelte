<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { boundsOf, decodeTopology, projectRing, type BoundaryFeature } from '$lib/topojson';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const MAP_SIZE = 600;
	let features = $state<BoundaryFeature[]>([]);
	let mapError = $state<string | null>(null);

	onMount(async () => {
		try {
			const response = await fetch('/boundaries/ug-adm2.topojson');
			if (!response.ok) throw new Error(`boundaries ${response.status}`);
			features = decodeTopology(await response.json(), 'adm2');
		} catch {
			mapError = 'The district map could not be loaded.';
		}
	});

	const filters = $derived(data.explore.filters);
	const countsByDistrict = $derived(
		new Map(
			data.explore.counts_by_district
				.filter((row) => row.district !== null)
				.map((row) => [row.district!.toLowerCase(), row.count])
		)
	);
	const unknownDistrict = $derived(
		data.explore.counts_by_district.find((row) => row.district === null)?.count ?? 0
	);
	const maxCount = $derived(Math.max(1, ...countsByDistrict.values()));
	const bounds = $derived(features.length > 0 ? boundsOf(features) : null);

	function shade(count: number | undefined): string {
		if (!count) return '#f5f5f4';
		const level = Math.min(1, Math.log10(count + 1) / Math.log10(maxCount + 1));
		const lightness = 88 - Math.round(level * 60);
		return `hsl(24 60% ${lightness}%)`;
	}

	const allKeys = ['category', 'nature', 'district', 'division', 'present_in'];

	/** A resolved path with the current filters (and any extra pairs) as its query string. */
	function withQuery(
		path: ResolvedPathname,
		extra: Record<string, string>,
		keys = ['category', 'nature', 'present_in']
	): ResolvedPathname {
		const params = new SvelteURLSearchParams();
		for (const key of keys as (keyof typeof filters)[]) {
			const value = filters[key];
			if (value) params.set(key, value);
		}
		for (const [key, value] of Object.entries(extra)) params.set(key, value);
		const text = params.toString();
		return (text ? `${path}?${text}` : path) as ResolvedPathname;
	}
</script>

<svelte:head>
	<title>TrustScore Atlas: Explore</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Explore segments</h1>
<p class="mt-2 max-w-2xl text-sm text-stone-600">
	Counts of businesses by district, register and sector, from the same regeneration that serves the
	pages. Filter, then open the matching search or export the district breakdown.
</p>

<form method="get" class="mt-4 flex flex-wrap gap-2">
	<label class="sr-only" for="category">Sector category</label>
	<input
		id="category"
		name="category"
		value={filters.category ?? ''}
		placeholder="Sector category"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<label class="sr-only" for="nature">Sector nature</label>
	<input
		id="nature"
		name="nature"
		value={filters.nature ?? ''}
		placeholder="Sector nature"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<label class="sr-only" for="district">District</label>
	<input
		id="district"
		name="district"
		value={filters.district ?? ''}
		placeholder="District"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<label class="sr-only" for="division">Division or subcounty</label>
	<input
		id="division"
		name="division"
		value={filters.division ?? ''}
		placeholder="Division or subcounty"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<label class="sr-only" for="present_in">Register slug</label>
	<input
		id="present_in"
		name="present_in"
		value={filters.present_in ?? ''}
		placeholder="Present in register"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<button
		type="submit"
		class="rounded-md bg-stone-900 px-5 py-2 text-base font-medium text-white hover:bg-stone-700"
	>
		Apply
	</button>
</form>

<p class="mt-6 text-sm text-stone-500">
	<span class="text-lg font-semibold text-stone-900"
		>{data.explore.total_count.toLocaleString()}</span
	>
	business{data.explore.total_count === 1 ? '' : 'es'}
	{#if filters.district}
		in {filters.district}
		(<a href={withQuery(resolve('/explore'), {})} class="underline">all districts</a>)
	{/if}
	&middot;
	<a href={withQuery(resolve('/search'), {}, allKeys)} class="underline">open in search</a>
	&middot;
	<a href={withQuery(resolve('/api/v1/explore'), { format: 'csv' }, allKeys)} class="underline"
		>export districts as CSV</a
	>
</p>

<div class="mt-6 grid gap-8 lg:grid-cols-2">
	<section>
		<h2 class="text-lg font-semibold text-stone-900">By district</h2>
		{#if mapError}
			<p class="mt-2 text-sm text-amber-700">{mapError}</p>
		{:else if bounds}
			<svg
				viewBox="0 0 {MAP_SIZE} {MAP_SIZE}"
				class="mt-3 w-full max-w-xl"
				role="img"
				aria-label="Uganda districts shaded by business count"
			>
				{#each features as feature (feature.pcode ?? feature.name)}
					{@const count = countsByDistrict.get((feature.name ?? '').toLowerCase())}
					{@const selected =
						!!filters.district &&
						filters.district.toLowerCase() === (feature.name ?? '').toLowerCase()}
					<a href={withQuery(resolve('/explore'), { district: feature.name ?? '' })}>
						<path
							d={feature.rings.map((ring) => projectRing(ring, bounds, MAP_SIZE)).join('')}
							fill={shade(count)}
							stroke={selected ? '#1c1917' : '#a8a29e'}
							stroke-width={selected ? 2 : 0.6}
						>
							<title>{feature.name}: {(count ?? 0).toLocaleString()}</title>
						</path>
					</a>
				{/each}
			</svg>
			<p class="mt-2 text-xs text-stone-500">
				Boundaries: OCHA common operational datasets for Uganda (COD-AB), CC BY-IGO, simplified.
				Darker means more businesses; grey means none matched.
			</p>
		{:else}
			<p class="mt-2 text-sm text-stone-500">Loading the district map...</p>
		{/if}
		<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
			{#each data.explore.counts_by_district.slice(0, 20) as row (row.district ?? 'unknown')}
				<li class="rounded-full bg-stone-100 px-3 py-1">
					{#if row.district}
						<a
							href={withQuery(resolve('/explore'), { district: row.district })}
							class="hover:underline">{row.district}</a
						>: {row.count.toLocaleString()}
					{:else}
						Unknown district: {row.count.toLocaleString()}
					{/if}
				</li>
			{/each}
		</ul>
		{#if unknownDistrict > 0}
			<p class="mt-2 text-xs text-stone-500">
				Registers without addresses (procurement and tax lists) leave {unknownDistrict.toLocaleString()}
				businesses without a district.
			</p>
		{/if}
	</section>

	<section class="flex flex-col gap-6">
		{#if data.explore.counts_by_division.length > 0}
			<div>
				<h2 class="text-lg font-semibold text-stone-900">By division or subcounty</h2>
				<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
					{#each data.explore.counts_by_division as row (row.division ?? 'unknown')}
						<li class="rounded-full bg-stone-100 px-3 py-1">
							{row.division ?? 'Unknown division'}: {row.count.toLocaleString()}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		<div>
			<h2 class="text-lg font-semibold text-stone-900">By register</h2>
			<p class="mt-1 text-xs text-stone-500">
				A business linked across registers is counted in each.
			</p>
			<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
				{#each data.explore.counts_by_register as row (row.register)}
					<li class="rounded-full bg-stone-100 px-3 py-1">
						{row.register}: {row.count.toLocaleString()}
					</li>
				{/each}
			</ul>
		</div>
		{#if data.explore.counts_by_category}
			<div>
				<h2 class="text-lg font-semibold text-stone-900">By sector category</h2>
				<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
					{#each data.explore.counts_by_category.slice(0, 30) as row (row.key ?? 'unknown')}
						<li class="rounded-full bg-stone-100 px-3 py-1">
							{row.key ?? 'Unknown category'}: {row.count.toLocaleString()}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if data.explore.counts_by_nature}
			<div>
				<h2 class="text-lg font-semibold text-stone-900">
					By sector nature within {filters.category}
				</h2>
				<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
					{#each data.explore.counts_by_nature.slice(0, 40) as row (row.key ?? 'unknown')}
						<li class="rounded-full bg-stone-100 px-3 py-1">
							{row.key ?? 'Unknown nature'}: {row.count.toLocaleString()}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
</div>
