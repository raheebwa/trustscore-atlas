<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { resolve } from '$app/paths';
	import { formatFieldLabel, formatWhen } from '$lib/format';
	import { describeReference } from '$lib/references';
	import { describeRegister } from '$lib/registers';
	import { groupStatements } from '$lib/trace';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PrecedenceLadder from '$lib/components/PrecedenceLadder.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const atlasId = $derived(data.atlasId);
	const trace = $derived(data.trace);
	const precedenceRanks = $derived(data.precedenceRanks);

	const groups = $derived(groupStatements(trace.statements, trace.winnerStatementId));
	const winner = $derived(groups.find((group) => group.isWinner));

	// A reference is a link only when the register published one; the rest are citations.
	const referenceFor = (statement: { source: string; source_ref: string }) =>
		describeReference({
			source: statement.source,
			source_ref: statement.source_ref,
			atlas_id: atlasId,
			field: trace.field
		});
</script>

<svelte:head>
	<title>TrustScore Atlas: Trace: {formatFieldLabel(trace.field)}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<a
		href={resolve('/b/[atlas_id]', { atlas_id: atlasId })}
		class="inline-flex w-fit items-center gap-1 text-xs text-ink-muted underline transition-colors duration-120 hover:text-ink"
	>
		<ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
		Back to the record
	</a>

	<PageHeader
		title={formatFieldLabel(trace.field)}
		lede="Every statement any register has made about this field, one row per distinct value, register and date. A register that lists the business more than once shows a count rather than repeating itself."
	/>

	{#if winner}
		<!-- The answer first: what Atlas publishes for this field, and why this statement won. -->
		<section class="flex flex-col gap-2 rounded-md border border-accent bg-accent-tint p-4">
			<p class="text-xs font-medium text-ink-muted">Published value</p>
			<p class="font-display text-2xl text-ink">{winner.statement.value}</p>
			<p class="text-sm text-ink-muted">
				From {describeRegister(winner.statement.source).short}, asserted
				<span class="tnum" title={winner.statement.asserted_at}
					>{formatWhen(winner.statement.asserted_at, { showTime: false })?.absolute}</span
				>, at precedence rank {winner.statement.precedence}. It wins because no statement of a
				higher rank exists for this field{#if winner.count > 1}, and {winner.count} listings in that register
					carry it{/if}.
			</p>
		</section>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-semibold text-ink">Every statement</h2>
		<ul class="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
			{#each groups as group (group.key)}
				{@const statement = group.statement}
				{@const reference = referenceFor(statement)}
				<li class="flex flex-col gap-2 p-4 {group.isWinner ? 'bg-accent-tint' : ''}">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<span class="text-base text-ink">{statement.value}</span>
						<span class="flex items-center gap-2 text-xs text-ink-muted">
							{#if group.isWinner}
								<span
									class="rounded-md border border-accent bg-surface px-2 py-0.5 text-2xs text-accent-ink"
									>published</span
								>
							{/if}
							<span class="tnum">rank {statement.precedence}</span>
							<span>{statement.confidence}</span>
						</span>
					</div>
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
						{#if reference.source_url}
							<a
								href={reference.source_url}
								class="text-ink underline"
								target="_blank"
								rel="external noreferrer">{describeRegister(statement.source).short}</a
							>
						{:else}
							<span class="text-ink">{describeRegister(statement.source).short}</span>
						{/if}
						<span>{reference.source_ref_label}</span>
						<span class="tnum" title={statement.asserted_at}
							>{formatWhen(statement.asserted_at, { showTime: false })?.absolute}</span
						>
					</div>
					{#if group.count > 1}
						<details class="text-xs text-ink-muted">
							<summary class="w-fit cursor-pointer">
								<span class="tnum">{group.count}</span> listings in this register carry this value
							</summary>
							<ul class="mt-1 flex flex-col gap-0.5 font-mono text-2xs">
								{#each group.records as record (record.statement_id)}
									<li>{record.source_record_id}</li>
								{/each}
							</ul>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
		{#if trace.next_cursor}
			<a
				href={`${resolve('/b/[atlas_id]/trace/[field]', { atlas_id: atlasId, field: trace.field })}?cursor=${encodeURIComponent(trace.next_cursor)}`}
				class="inline-flex h-8 w-fit items-center rounded-md border border-border bg-surface px-3 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
			>
				Next page
			</a>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-semibold text-ink">How this field was decided</h2>
		<PrecedenceLadder ranks={precedenceRanks} activeRank={winner?.statement.precedence} />
		<p class="max-w-prose text-xs text-ink-muted">
			Within a rank, a value wins on distinct source-record support, then the asserted date, then
			the shortest normalised form, then the raw value. That order is the same for every field and
			every pack, so a value never wins by accident of ordering.
		</p>
	</section>
</div>
