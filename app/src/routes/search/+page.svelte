<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { summariseIdentifiers, formatWhen } from '$lib/format';
	import { resolve } from '$app/paths';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// One control per published dimension; every option comes from the data, never from free text.
	const FILTER_FIELDS = $derived([
		{ name: 'district', label: 'District', options: data.facets.district },
		{ name: 'division', label: 'Division or subcounty', options: data.facets.division },
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
</script>

<svelte:head>
	<title>TrustScore Atlas: Search</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Search businesses</h1>

<form method="get" class="mt-4 flex flex-col gap-3">
	<label class="sr-only" for="q">Search businesses</label>
	<input
		id="q"
		name="q"
		type="search"
		value={data.query}
		placeholder="Search by business name"
		class="w-full rounded-md border border-border bg-surface px-4 py-2 text-base text-ink transition-colors duration-120 placeholder:text-ink-muted hover:border-border-strong"
	/>
	<input type="hidden" name="country" value={data.country} />
	<button
		type="submit"
		class="h-10 w-fit rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
	>
		Search
	</button>
</form>

{#if !data.districtCheck.known}
	<div class="mt-4">
		<EmptyState
			title="No district by that name"
			body={`The data carries no district or division called "${data.district || data.segmentFilters.district}". These are the closest published values.`}
			examples={data.districtCheck.suggestions.map((value) => ({
				label: value,
				href: `${resolve('/search')}?q=${encodeURIComponent(data.query)}&district=${encodeURIComponent(value)}`
			}))}
		/>
	</div>
{/if}

<div class="mt-3 flex flex-col gap-3">
	<FilterBar
		fields={FILTER_FIELDS}
		values={filterValues}
		hidden={[
			{ name: 'q', value: data.query },
			{ name: 'country', value: data.country }
		]}
		{clearHref}
	/>
</div>

{#if data.segment}
	<p class="mt-6 text-sm text-stone-500">
		{data.segment.total_count} matching business{data.segment.total_count === 1 ? '' : 'es'}
	</p>
	{#if data.segment.counts_by_division.length > 0}
		<ul class="mt-3 flex flex-wrap gap-2 text-sm text-stone-600">
			{#each data.segment.counts_by_division as row (row.division ?? 'unknown')}
				<li class="rounded-full bg-stone-100 px-3 py-1">
					{row.division ?? 'Unknown division'}: {row.count}
				</li>
			{/each}
		</ul>
	{/if}
	{#if data.segment.top_candidates.length > 0}
		<h2 class="mt-6 text-lg font-semibold text-stone-900">Highest Formality values</h2>
		<ul class="mt-3 flex flex-col gap-3">
			{#each data.segment.top_candidates as item (item.atlas_id)}
				<li class="rounded-lg border border-stone-200 bg-white p-4">
					<a
						href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })}
						class="font-medium text-stone-900 hover:underline">{item.canonical_name}</a
					>
					<p class="mt-1 text-sm text-stone-600">
						{item.location}
						&middot; Formality {item.formality.value}/{item.formality.max}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
{:else if data.query.length === 0}
	<p class="mt-6 text-stone-500">Type a business name above to search the atlas.</p>
{:else}
	{#if data.query.length < data.minLength}
		<p class="mt-4 text-sm text-amber-700">
			Showing name matches only for short queries. Type {data.minLength} or more characters for full search
			across names and identifiers.
		</p>
	{/if}

	{#if data.results && data.results.results.length > 0}
		<p class="mt-4 text-sm text-stone-500">
			{data.results.total_count} result{data.results.total_count === 1 ? '' : 's'} for "{data.query}"
		</p>
		<ul class="mt-4 flex flex-col gap-3">
			{#each data.results.results as item (item.atlas_id)}
				<li class="rounded-lg border border-stone-200 bg-white p-4">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<a
							href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })}
							class="text-lg font-medium text-stone-900 hover:underline"
						>
							{item.canonical_name}
						</a>
						{#if item.formality}
							<span class="max-w-xl rounded-lg bg-stone-100 px-3 py-1 text-sm text-stone-700">
								<span class="font-medium">{item.formality.summary}</span>
								<span class="block text-xs text-stone-500">{item.formality.coverage_summary}</span>
								<span class="block text-xs text-stone-500"
									>Evaluated {formatWhen(item.formality.evaluation_as_of, { showTime: false })
										?.absolute}</span
								>
							</span>
						{/if}
					</div>
					<p class="mt-1 text-sm text-stone-600">
						{item.location}
						{#if item.sector_category}
							&middot; {item.sector_category}{item.sector_nature ? `/${item.sector_nature}` : ''}
						{/if}
					</p>
					{#if item.identifiers.length > 0}
						<p class="mt-1 text-sm text-stone-500">
							{summariseIdentifiers(item.identifiers).join(' \u00b7 ')}
						</p>
					{/if}
					<p class="mt-1 text-xs text-stone-500">
						Register coverage: {item.coverage_summary}.
					</p>
				</li>
			{/each}
		</ul>
		{#if data.results.next_cursor}
			<form method="get" action={resolve('/search')} class="mt-4">
				<input type="hidden" name="q" value={data.query} />
				<input type="hidden" name="district" value={data.district} />
				<input type="hidden" name="cursor" value={data.results.next_cursor} />
				<button
					type="submit"
					class="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
					>Next page</button
				>
			</form>
		{/if}
	{:else}
		<p class="mt-6 text-stone-500">No businesses found for "{data.query}".</p>
	{/if}
{/if}
