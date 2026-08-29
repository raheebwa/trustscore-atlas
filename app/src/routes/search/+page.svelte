<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Search</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Search businesses</h1>

<form method="get" class="mt-4 flex flex-wrap gap-2">
	<label class="sr-only" for="q">Search businesses</label>
	<input
		id="q"
		name="q"
		type="search"
		value={data.query}
		placeholder="Search by business name..."
		class="w-full rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<label class="sr-only" for="district">District or division</label>
	<input
		id="district"
		name="district"
		value={data.district}
		placeholder="District or division"
		class="rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
	/>
	<button
		type="submit"
		class="rounded-md bg-stone-900 px-5 py-2 text-base font-medium text-white hover:bg-stone-700"
	>
		Search
	</button>
</form>

{#if data.query.length === 0}
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
						{item.division ?? 'Unknown division'}, {item.district ?? 'Unknown district'}
						{#if item.sector_category}
							&middot; {item.sector_category}{item.sector_nature ? `/${item.sector_nature}` : ''}
						{/if}
					</p>
					{#if item.identifiers.length > 0}
						<p class="mt-1 text-sm text-stone-500">
							{item.identifiers.map((id) => `${id.scheme}: ${id.value}`).join(', ')}
						</p>
					{/if}
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
