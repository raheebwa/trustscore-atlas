<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let stats = $derived(data.stats);
</script>

<svelte:head>
	<title>TrustScore Atlas</title>
</svelte:head>

<section class="flex flex-col gap-4 text-center">
	<h1 class="text-3xl font-semibold tracking-tight text-stone-900">TrustScore Atlas</h1>
	<p class="mx-auto max-w-xl text-stone-600">
		Public business records from Uganda's government registers, harmonised into one record per
		business with field-level provenance and deterministic scores.
	</p>

	<form method="get" action="/search" class="mx-auto flex w-full max-w-lg gap-2 pt-2">
		<label class="sr-only" for="q">Search businesses</label>
		<input
			id="q"
			name="q"
			type="search"
			placeholder="Search by business name..."
			class="w-full rounded-md border border-stone-300 px-4 py-2 text-base shadow-sm focus:border-stone-500 focus:outline-none"
		/>
		<button
			type="submit"
			class="rounded-md bg-stone-900 px-5 py-2 text-base font-medium text-white hover:bg-stone-700"
		>
			Search
		</button>
	</form>
</section>

<section class="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
	<div class="rounded-lg border border-stone-200 bg-white p-6 text-center">
		<p class="text-3xl font-semibold text-stone-900">{stats.businessCount.toLocaleString()}</p>
		<p class="mt-1 text-sm text-stone-500">businesses in the atlas</p>
	</div>
	<div class="rounded-lg border border-stone-200 bg-white p-6 text-center">
		<p class="text-3xl font-semibold text-stone-900">{stats.sourceCount.toLocaleString()}</p>
		<p class="mt-1 text-sm text-stone-500">public sources harmonised</p>
	</div>
	<div class="rounded-lg border border-stone-200 bg-white p-6 text-center">
		<p class="text-lg font-semibold break-all text-stone-900">
			{stats.liveRegenerationId ?? 'not seeded'}
		</p>
		<p class="mt-1 text-sm text-stone-500">
			live regeneration{stats.liveRegenerationDate ? `, ${stats.liveRegenerationDate}` : ''}
		</p>
	</div>
</section>

<section class="mt-12">
	<h2 class="text-lg font-semibold text-stone-900">Source freshness</h2>
	<div class="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
		<table class="w-full min-w-[32rem] text-left text-sm">
			<thead class="border-b border-stone-200 text-stone-500">
				<tr>
					<th class="px-4 py-2 font-medium">Source</th>
					<th class="px-4 py-2 font-medium">Cadence</th>
					<th class="px-4 py-2 font-medium">Last run</th>
					<th class="px-4 py-2 font-medium">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each stats.sources as source (source.slug)}
					<tr class="border-b border-stone-100 last:border-0">
						<td class="px-4 py-2 text-stone-900">{source.title}</td>
						<td class="px-4 py-2 text-stone-600">{source.cadence}</td>
						<td class="px-4 py-2 text-stone-600">{source.last_run_at ?? 'never'}</td>
						<td class="px-4 py-2">
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium"
								class:bg-emerald-100={source.status === 'fresh'}
								class:text-emerald-800={source.status === 'fresh'}
								class:bg-amber-100={source.status === 'stale'}
								class:text-amber-800={source.status === 'stale'}
								class:bg-red-100={source.status === 'failed'}
								class:text-red-800={source.status === 'failed'}
							>
								{source.status}
							</span>
						</td>
					</tr>
				{:else}
					<tr>
						<td class="px-4 py-3 text-stone-500" colspan="4">No sources loaded yet.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-2 text-sm">
		<a href={resolve('/sources')} class="text-stone-600 underline hover:text-stone-900"
			>See every source, licence, and cadence</a
		>
	</p>
</section>
