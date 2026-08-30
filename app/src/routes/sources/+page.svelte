<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { nextScheduledRun } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Sources</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Sources</h1>
<p class="mt-1 text-stone-600">
	Every register the atlas harmonises, with its licence, cadence, the last time it was pulled and
	when the scheduled refresh pulls it next.
</p>

<div class="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
	<table class="w-full min-w-[52rem] text-left text-sm">
		<thead class="border-b border-stone-200 text-stone-500">
			<tr>
				<th class="px-4 py-2 font-medium">Publisher</th>
				<th class="px-4 py-2 font-medium">Title</th>
				<th class="px-4 py-2 font-medium">Licence</th>
				<th class="px-4 py-2 font-medium">Cadence</th>
				<th class="px-4 py-2 font-medium">Last run</th>
				<th class="px-4 py-2 font-medium">Next due</th>
				<th class="px-4 py-2 font-medium">Rows</th>
				<th class="px-4 py-2 font-medium">Adapter</th>
				<th class="px-4 py-2 font-medium">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each data.sources as source (source.slug)}
				<tr class="border-b border-stone-100 last:border-0">
					<td class="px-4 py-2 text-stone-900">{source.publisher}</td>
					<td class="px-4 py-2">
						<a
							href={source.url}
							class="text-stone-700 underline"
							target="_blank"
							rel="external noreferrer">{source.title}</a
						>
					</td>
					<td class="px-4 py-2 text-stone-600">{source.licence}</td>
					<td class="px-4 py-2 text-stone-600">{source.cadence}</td>
					<td class="px-4 py-2 text-stone-600">{source.last_run_at ?? 'never'}</td>
					<td class="px-4 py-2 text-stone-600"
						>{nextScheduledRun(source.cadence, source.last_run_at)}</td
					>
					<td class="px-4 py-2 text-stone-600">{source.row_count ?? '-'}</td>
					<td class="px-4 py-2 text-stone-600">{source.adapter_version ?? '-'}</td>
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
							{source.status === 'not_loaded' ? 'not yet checked' : source.status}
						</span>
						{#if source.status_note}
							<p class="mt-1 text-xs text-stone-600">{source.status_note}</p>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td class="px-4 py-3 text-stone-500" colspan="8">No sources loaded yet.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
