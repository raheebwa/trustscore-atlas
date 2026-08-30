<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import { humaniseValue } from '$lib/format';
	import { scopeLine } from '$lib/scope';
	import Search from '@lucide/svelte/icons/search';
	import BarList from '$lib/components/BarList.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import CoverageBar from '$lib/components/CoverageBar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import { titleCasePlace } from '$lib/location';
	import IdentifierChips from '$lib/components/IdentifierChips.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// One control per published dimension; every option comes from the data, never from free text.
	/** Place names as a reader writes them, filtering on the value the register published. */
	const places = (values: { value: string; count?: number }[]) =>
		values.map((option) => ({ ...option, label: titleCasePlace(option.value) }));

	const FILTER_FIELDS = $derived([
		{ name: 'district', label: 'District', options: places(data.facets.district) },
		{ name: 'division', label: 'Division or subcounty', options: places(data.facets.division) },
		{ name: 'category', label: 'Sector category', options: data.facets.sector_category },
		{ name: 'nature', label: 'Sector nature', options: data.facets.sector_nature },
		{ name: 'present_in', label: 'Present in register', options: data.facets.register }
	]);

	const filterValues = $derived({
		district: data.district || (data.segmentFilters.district ?? ''),
		division: data.segmentFilters.division ?? '',
		category: data.segmentFilters.category ?? '',
		nature: data.segmentFilters.nature ?? '',
		present_in: data.segmentFilters.present_in ?? ''
	});

	// Clearing filters keeps the query and the country: it is the same search, unfiltered.
	const clearHref = $derived(resolve('/search'));
	const searchHref = $derived(resolve('/search'));

	// "N results for X in District Y": a reader should never have to work out why these results.
	const countLine = $derived.by(() => {
		if (!data.results) return null;
		const total = data.results.total_count.toLocaleString();
		const noun = data.results.total_count === 1 ? 'result' : 'results';
		const where = filterValues.district ? ` in ${filterValues.district}` : '';
		return `${total} ${noun} for "${data.query}"${where} in ${data.countryName}`;
	});

	const nextHref = $derived(
		data.results?.next_cursor
			? `${searchHref}?q=${encodeURIComponent(data.query)}${
					filterValues.district ? `&district=${encodeURIComponent(filterValues.district)}` : ''
				}&cursor=${encodeURIComponent(data.results.next_cursor)}`
			: null
	);

	const broaderHref = $derived(
		`${searchHref}?q=${encodeURIComponent(data.query.split(/\s+/)[0] ?? data.query)}`
	);
</script>

<svelte:head>
	<title>TrustScore Atlas: Search</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Search businesses"
		lede="Search by name or identifier across the registers loaded for the pack in view, then narrow by the values the data actually carries."
		meta={[scopeLine('Searching', data.countryName, data.registersLoaded)]}
	/>

	<form method="get" class="flex flex-wrap gap-2">
		<label class="sr-only" for="q">Search businesses</label>
		<div class="relative min-w-64 grow">
			<Search
				size={20}
				strokeWidth={1.5}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
			/>
			<input
				id="q"
				name="q"
				type="search"
				value={data.query}
				placeholder="Search by business name"
				class="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-10 text-base text-ink transition-colors duration-120 placeholder:text-ink-muted hover:border-border-strong"
			/>
		</div>
		<input type="hidden" name="country" value={data.country} />
		<button
			type="submit"
			class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
		>
			Search
		</button>
	</form>

	<FilterBar
		fields={FILTER_FIELDS}
		values={filterValues}
		hidden={[
			{ name: 'q', value: data.query },
			{ name: 'country', value: data.country }
		]}
		{clearHref}
	/>

	{#if !data.districtCheck.known}
		<EmptyState
			title="No district by that name"
			body={`The data carries no district or division called "${data.district || data.segmentFilters.district}". These are the closest published values.`}
			examples={data.districtCheck.suggestions.map((value) => ({
				label: value,
				href: `${searchHref}?q=${encodeURIComponent(data.query)}&district=${encodeURIComponent(value)}`
			}))}
		/>
	{:else if data.segment}
		<!-- Filters without a query: the answer is the shape of the segment, not a list of names. -->
		<section class="flex flex-col gap-4">
			<p class="text-base text-ink">
				<span class="font-display tnum text-2xl">{data.segment.total_count.toLocaleString()}</span>
				businesses match these filters
			</p>
			{#if data.segment.counts_by_division.length > 0}
				<div class="flex flex-col gap-2">
					<h2 class="text-lg font-semibold text-ink">By division</h2>
					<BarList
						rows={data.segment.counts_by_division.map((row) => ({
							key: row.division ?? 'Not published',
							count: row.count
						}))}
						unit="divisions"
					/>
				</div>
			{/if}
			{#if data.segment.top_candidates.length > 0}
				<div class="flex flex-col gap-2">
					<h2 class="text-lg font-semibold text-ink">Highest Formality in this segment</h2>
					<ul class="flex flex-col gap-2">
						{#each data.segment.top_candidates as item (item.atlas_id)}
							<li class="rounded-md border border-border bg-surface">
								<a
									href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })}
									class="flex flex-wrap items-baseline justify-between gap-2 p-3 transition-colors duration-120 hover:bg-panel"
								>
									<span class="text-base font-medium text-ink">{item.canonical_name}</span>
									<span class="text-xs text-ink-muted">{item.location}</span>
									<span class="tnum text-xs text-ink"
										>Formality {item.formality.value}/{item.formality.max}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{:else if data.query.length === 0}
		<EmptyState
			title="Search the register set"
			body="Type a business name or a tax identifier. Every result carries the registers it was found in and what has not been checked."
			examples={[
				{ label: 'Roofings', href: `${searchHref}?q=Roofings` },
				{ label: 'Tororo Cement', href: `${searchHref}?q=Tororo+Cement` }
			]}
		/>
	{:else if data.results && data.results.results.length > 0}
		<div class="flex flex-col gap-3">
			<p class="text-xs text-ink-muted">{countLine}</p>
			<!-- Rows, not cards: a list of businesses is a list, and the eye scans a column of names. -->
			<ul
				class="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
			>
				{#each data.results.results as item (item.atlas_id)}
					<li>
						<a
							href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })}
							class="flex flex-col gap-2 p-4 transition-colors duration-120 hover:bg-panel"
						>
							<span class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
								<span class="text-lg font-medium text-ink">{item.canonical_name}</span>
								<span class="text-xs text-ink-muted">
									{item.location}
									{#if item.sector_category}
										&middot; {humaniseValue(item.sector_category)}{item.sector_nature
											? ` / ${humaniseValue(item.sector_nature)}`
											: ''}
									{/if}
								</span>
							</span>
							<IdentifierChips identifiers={item.identifiers} />
							<!-- Wide enough and the two readings sit side by side rather than in half-width
							     columns with a gulf between them. -->
							<span class="grid gap-3 md:grid-cols-2 2xl:flex 2xl:flex-wrap 2xl:gap-8">
								<span class="block max-w-40 2xl:max-w-64">
									<CoverageBar coverage={item.coverage} summary={item.coverage_summary} />
								</span>
								{#if item.formality}
									<span class="block max-w-64 2xl:max-w-96">
										<ScoreBar
											score={{
												rubric: item.formality.rubric,
												value: item.formality.value,
												max: item.formality.max,
												checkable: item.formality.checkable,
												unknown: item.formality.unknown,
												unknown_predicates: item.formality.unknown_predicates
											}}
											compact
										/>
									</span>
								{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
			<Pagination
				returned={data.results.results.length}
				totalCount={data.results.total_count}
				{nextHref}
			/>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#if data.query.length < data.minLength}
				<Callout tone="warning" title="Short queries match names only">
					Type {data.minLength} characters or more to search identifiers as well as names.
				</Callout>
			{/if}
			<EmptyState
				title={`Nothing matches "${data.query}"`}
				body="No business in the loaded registers carries that name or identifier. Try a shorter name, or clear the filters."
				examples={[
					{ label: `Search for "${data.query.split(/\s+/)[0]}"`, href: broaderHref },
					{ label: 'Clear all filters', href: clearHref }
				]}
			/>
		</div>
	{/if}
</div>
