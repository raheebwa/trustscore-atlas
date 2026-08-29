<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatFieldLabel } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let atlasId = $derived(data.atlasId);
	let trace = $derived(data.trace);
	let precedenceRanks = $derived(data.precedenceRanks);
</script>

<svelte:head>
	<title>TrustScore Atlas: Trace: {formatFieldLabel(trace.field)}</title>
</svelte:head>

<p class="text-sm text-stone-500">
	<a href={resolve('/b/[atlas_id]', { atlas_id: atlasId })} class="underline hover:text-stone-900"
		>Back to business record</a
	>
</p>
<h1 class="mt-2 text-2xl font-semibold text-stone-900">{formatFieldLabel(trace.field)}</h1>
<p class="mt-1 text-stone-600">
	Every statement on file for this field. The winner is highlighted.
</p>

<div class="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
	<table class="w-full min-w-[44rem] text-left text-sm">
		<thead class="border-b border-stone-200 text-stone-500">
			<tr>
				<th class="px-4 py-2 font-medium">Value</th>
				<th class="px-4 py-2 font-medium">Source</th>
				<th class="px-4 py-2 font-medium">Asserted</th>
				<th class="px-4 py-2 font-medium">Precedence</th>
				<th class="px-4 py-2 font-medium">Confidence</th>
			</tr>
		</thead>
		<tbody>
			{#each trace.statements as statement (statement.statement_id)}
				<tr
					class="border-b border-stone-100 last:border-0"
					class:bg-emerald-50={statement.statement_id === trace.winnerStatementId}
				>
					<td class="px-4 py-2 text-stone-900">
						{statement.value}
						{#if statement.statement_id === trace.winnerStatementId}
							<span
								class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
								>winner</span
							>
						{/if}
					</td>
					<td class="px-4 py-2">
						<a
							href={statement.source_ref}
							class="text-stone-600 underline"
							target="_blank"
							rel="external noreferrer">{statement.source}</a
						>
					</td>
					<td class="px-4 py-2 text-stone-600">{statement.asserted_at}</td>
					<td class="px-4 py-2 text-stone-600">{statement.precedence}</td>
					<td class="px-4 py-2 text-stone-600">{statement.confidence}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<section class="mt-8">
	<h2 class="text-lg font-semibold text-stone-900">How precedence works</h2>
	<ol class="mt-2 flex flex-col gap-2">
		{#each precedenceRanks as rank (rank.rank)}
			<li class="text-sm text-stone-700">
				<span class="font-medium text-stone-900">{rank.rank}. {rank.label}:</span>
				{rank.explanation}
			</li>
		{/each}
	</ol>
	<p class="mt-2 text-sm text-stone-500">
		Values are ordered by rank, distinct source-record support, asserted date, shortest normalised
		form, then raw value.
	</p>
</section>
