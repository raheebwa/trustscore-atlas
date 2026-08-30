<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Sources (ops)</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Sources</h1>
<p class="mt-1 text-sm text-stone-600">
	Signed in as {data.maintainer}. Last accepted run and status note per register.
	<a href={resolve('/ops')} class="underline">Queue</a>
</p>
<p class="mt-2 text-sm text-stone-500">
	Pulls run from the maintainer's machine in this deployment; "run now" arrives with the scheduled
	pipeline.
</p>

<div class="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
	<table class="w-full min-w-[48rem] text-left text-sm">
		<thead class="border-b border-stone-200 text-stone-500">
			<tr>
				<th class="px-4 py-2 font-medium">Source</th>
				<th class="px-4 py-2 font-medium">Status</th>
				<th class="px-4 py-2 font-medium">Last run</th>
				<th class="px-4 py-2 font-medium">Rows</th>
				<th class="px-4 py-2 font-medium">Note</th>
			</tr>
		</thead>
		<tbody>
			{#each data.sources as source (source.slug)}
				<tr class="border-b border-stone-100 last:border-0">
					<td class="px-4 py-2 font-mono text-xs text-stone-900">{source.slug}</td>
					<td class="px-4 py-2 text-stone-700">{source.status}</td>
					<td class="px-4 py-2 text-stone-600">{source.last_run_at ?? 'never'}</td>
					<td class="px-4 py-2 text-stone-600">{source.row_count ?? '-'}</td>
					<td class="px-4 py-2 text-stone-600">{source.status_note ?? ''}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
