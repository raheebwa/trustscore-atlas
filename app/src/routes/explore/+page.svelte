<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import BarList from '$lib/components/BarList.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import MapChoropleth from '$lib/components/MapChoropleth.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { humaniseValue } from '$lib/format';
	import { describeRegister } from '$lib/registers';
	import { scopeLine } from '$lib/scope';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const explore = $derived(data.explore);
	const filters = $derived(explore.filters);

	const FILTER_FIELDS = $derived([
		{ name: 'district', label: 'District', options: data.facets.district },
		{ name: 'division', label: 'Division or subcounty', options: data.facets.division },
		{ name: 'category', label: 'Sector category', options: data.facets.sector_category },
		{ name: 'nature', label: 'Sector nature', options: data.facets.sector_nature },
		{ name: 'present_in', label: 'Present in register', options: data.facets.register }
	]);

	const filterValues = $derived({
		district: filters.district ?? '',
		division: filters.division ?? '',
		category: filters.category ?? '',
		nature: filters.nature ?? '',
		present_in: filters.present_in ?? ''
	});

	const explorePath = $derived(resolve('/explore'));

	/** The same page with one filter added, so a bar and an area on the map are both links. */
	function withFilter(name: string, value: string): string {
		const pairs: [string, string][] = [['country', data.country]];
		for (const [key, current] of Object.entries(filterValues)) {
			if (current && key !== name) pairs.push([key, current]);
		}
		pairs.push([name, value]);
		return `${explorePath}?${pairs
			.map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
			.join('&')}`;
	}

	const districtRows = $derived(
		explore.counts_by_district
			.filter((row) => row.district !== null)
			.map((row) => ({ key: row.district as string, count: row.count }))
	);
	const unknownDistrict = $derived(
		explore.counts_by_district.find((row) => row.district === null)?.count ?? 0
	);
</script>

<svelte:head>
	<title>TrustScore Atlas: Explore</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Explore segments"
		lede="Counts of businesses by district, register and sector, from the same regeneration that serves every page. Filter here, then open the matching search."
		meta={[scopeLine('Exploring', data.countryName, data.registersLoaded)]}
	>
		{#snippet actions()}
			<a
				href={`${resolve('/search')}${explore.search_link.replace('/search', '')}`}
				class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-ink transition-colors duration-120 hover:border-border-strong"
			>
				<Search size={20} strokeWidth={1.5} aria-hidden="true" />
				Open in search
			</a>
			<a
				href={`${resolve('/api/v1/explore')}?country=${data.country}&format=csv`}
				class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-ink transition-colors duration-120 hover:border-border-strong"
			>
				<Download size={20} strokeWidth={1.5} aria-hidden="true" />
				District CSV
			</a>
		{/snippet}
	</PageHeader>

	<FilterBar
		fields={FILTER_FIELDS}
		values={filterValues}
		hidden={[{ name: 'country', value: data.country }]}
		clearHref={`${explorePath}?country=${data.country}`}
		submitLabel="Apply"
	/>

	<StatTile
		label="Businesses in this segment"
		value={explore.total_count}
		caption={`Counted once each, from the ${data.registersLoaded} ${data.registersLoaded === 1 ? 'register' : 'registers'} loaded for ${data.countryName}.`}
		emphasis="lead"
	/>

	{#if explore.total_count === 0}
		<EmptyState
			title="No business matches these filters"
			body="Every filter offers only values the data carries, so this combination is simply empty. Drop one filter to widen it."
			examples={[{ label: 'Clear all filters', href: `${explorePath}?country=${data.country}` }]}
		/>
	{:else}
		<div class="grid gap-6 lg:grid-cols-12">
			<section class="flex flex-col gap-3 lg:col-span-7">
				<h2 class="text-xl font-semibold text-ink">Where they are</h2>
				{#if data.map}
					<MapChoropleth
						asset={data.map.asset}
						object={data.map.object}
						attribution={data.map.attribution}
						counts={districtRows}
						selected={filterValues.district}
						hrefFor={(name) => withFilter('district', name)}
						label={`Map of ${data.countryName}: each area is a link shaded by how many businesses it holds`}
					/>
				{:else}
					<Callout tone="info" title="No boundary map for this pack yet">
						This pack has not declared a boundary set, so its areas are listed rather than drawn.
						Every count beside this is the same number a map would shade.
					</Callout>
				{/if}
				{#if unknownDistrict > 0}
					<p class="text-xs text-ink-muted">
						<span class="tnum">{unknownDistrict.toLocaleString()}</span>
						businesses carry no district in any register that publishes one.
					</p>
				{/if}
			</section>

			<div class="flex flex-col gap-6 lg:col-span-5">
				<section class="flex flex-col gap-2">
					<h2 class="text-lg font-semibold text-ink">By district</h2>
					<BarList
						rows={districtRows}
						unit="districts"
						hrefFor={(key) => withFilter('district', key)}
					/>
				</section>

				{#if explore.counts_by_division.length > 0}
					<section class="flex flex-col gap-2">
						<h2 class="text-lg font-semibold text-ink">By division</h2>
						<BarList
							rows={explore.counts_by_division
								.filter((row) => row.division !== null)
								.map((row) => ({ key: row.division as string, count: row.count }))}
							unit="divisions"
							hrefFor={(key) => withFilter('division', key)}
						/>
					</section>
				{/if}

				<section class="flex flex-col gap-2">
					<h2 class="text-lg font-semibold text-ink">By register</h2>
					<BarList
						rows={explore.counts_by_register.map((row) => ({
							key: describeRegister(row.register).short,
							count: row.count
						}))}
						unit="registers"
					/>
				</section>

				{#if explore.counts_by_category}
					<section class="flex flex-col gap-2">
						<h2 class="text-lg font-semibold text-ink">By sector category</h2>
						<BarList
							rows={explore.counts_by_category
								.filter((row) => row.key !== null)
								.map((row) => ({ key: humaniseValue(row.key), count: row.count }))}
							unit="categories"
							hrefFor={(key) => withFilter('category', key)}
						/>
					</section>
				{/if}

				{#if explore.counts_by_nature}
					<section class="flex flex-col gap-2">
						<h2 class="text-lg font-semibold text-ink">By sector nature</h2>
						<BarList
							rows={explore.counts_by_nature
								.filter((row) => row.key !== null)
								.map((row) => ({ key: humaniseValue(row.key), count: row.count }))}
							unit="natures"
							hrefFor={(key) => withFilter('nature', key)}
						/>
					</section>
				{/if}
			</div>
		</div>
	{/if}
</div>
