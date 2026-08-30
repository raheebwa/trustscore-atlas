<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { describeReference } from '$lib/references';
	import { groupStatements } from '$lib/trace';
	import { resolve } from '$app/paths';
	import { formatFieldLabel } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let atlasId = $derived(data.atlasId);
	let trace = $derived(data.trace);
	let precedenceRanks = $derived(data.precedenceRanks);

	// A reference is a link only when the register published one; the rest are citations.
	const referenceFor = (statement: { source: string; source_ref: string }) =>
		describeReference({
			source: statement.source,
			source_ref: statement.source_ref,
			atlas_id: data.atlasId,
			field: data.trace.field
		});
</script>

// SPDX-License-Identifier: Apache-2.0

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
	Statements on this page for the field, one row per distinct value, source and date; a register
	that lists the business several times shows a count. The winning value is highlighted when it
	appears here.
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
			{#each groupStatements(trace.statements, trace.winnerStatementId) as group (group.key)}
				{@const statement = group.statement}
				<tr class="border-b border-stone-100 last:border-0" class:bg-emerald-50={group.isWinner}>
					<td class="px-4 py-2 text-stone-900">
						{statement.value}
						{#if group.isWinner}
							<span
								class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
								>winner</span
							>
						{/if}
						{#if group.count > 1}
							<details class="mt-1 text-xs text-stone-500">
								<summary class="cursor-pointer">
									<span class="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700"
										>x{group.count} listings</span
									>
									in this register
								</summary>
								<ul class="mt-1 list-disc pl-5 font-mono">
									{#each group.records as record (record.statement_id)}
										<li>{record.source_record_id}</li>
									{/each}
								</ul>
							</details>
						{/if}
					</td>
					<td class="px-4 py-2">
						{#if referenceFor(statement).source_url}
							<a
								href={referenceFor(statement).source_url}
								class="text-stone-600 underline"
								target="_blank"
								rel="external noreferrer">{statement.source}</a
							>
						{:else}
							<span class="text-stone-700">{statement.source}</span>
						{/if}
						<span class="block text-xs text-stone-500"
							>{referenceFor(statement).source_ref_label}</span
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

{#if trace.next_cursor}
	<a
		href={resolve(`/b/[atlas_id]/trace/[field]?cursor=${encodeURIComponent(trace.next_cursor)}`, {
			atlas_id: atlasId,
			field: trace.field
		})}
		class="mt-4 inline-block rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
		>Next page</a
	>
{/if}

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
