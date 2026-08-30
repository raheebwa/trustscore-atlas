<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { summariseIdentifiers } from '$lib/format';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// One control per published dimension; the options come from the data, never from free text.
	const FILTERS = [
		{ name: 'district', facet: 'district', label: 'District' },
		{ name: 'division', facet: 'division', label: 'Division or subcounty' },
		{ name: 'category', facet: 'sector_category', label: 'Sector category' },
		{ name: 'nature', facet: 'sector_nature', label: 'Sector nature' },
		{ name: 'present_in', facet: 'register', label: 'Present in register' }
	] as const;

	// A GET form submits every control, so an untouched filter would add an empty query parameter.
	// Disabling the empty ones leaves the address bar showing only the filters actually chosen.
	function dropEmptyControls(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		for (const control of form.elements) {
			const field = control as HTMLInputElement | HTMLSelectElement;
			if (field.name && field.value === '') field.disabled = true;
		}
	}

	function selected(name: (typeof FILTERS)[number]['name']): string {
		if (name === 'district') return data.district || (data.segmentFilters.district ?? '');
		return data.segmentFilters[name] ?? '';
	}
</script>

<svelte:head>
	<title>TrustScore Atlas: Search</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Search businesses</h1>

<form method="get" class="mt-4 flex flex-wrap gap-2" onsubmit={dropEmptyControls}>
	<label class="sr-only" for="q">Search businesses</label>
	<input
		id="q"
		name="q"
		type="search"
		value={data.query}
		placeholder="Search by business name..."
		class="w-full rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	{#each FILTERS as filter (filter.name)}
		<label class="sr-only" for={filter.name}>{filter.label}</label>
		<select
			id={filter.name}
			name={filter.name}
			value={selected(filter.name)}
			class="rounded-md border border-stone-300 bg-white px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
		>
			<option value="">{filter.label}: any</option>
			{#each data.facets[filter.facet] as option (option.value)}
				<option value={option.value}>{option.value} ({option.count.toLocaleString()})</option>
			{/each}
		</select>
	{/each}
	<button
		type="submit"
		class="rounded-md bg-stone-900 px-5 py-2 text-base font-medium text-white hover:bg-stone-700"
	>
		Search
	</button>
</form>

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
									>Evaluated {item.formality.evaluation_as_of}</span
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
