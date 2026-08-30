<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { formatWhen, nextScheduledRun } from '$lib/format';
	import { describeRegister } from '$lib/registers';
	import { scopeLine } from '$lib/scope';
	import Callout from '$lib/components/Callout.svelte';
	import FreshnessBadge from '$lib/components/FreshnessBadge.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import RegisterBadge from '$lib/components/RegisterBadge.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STATUSES = [
		{ id: 'fresh', label: 'Fresh', caption: 'Pulled within its cadence.' },
		{ id: 'stale', label: 'Stale', caption: 'Overdue against its cadence.' },
		{ id: 'failed', label: 'Failed', caption: 'The last attempt did not complete.' },
		{ id: 'not_loaded', label: 'Not yet checked', caption: 'No accepted run yet.' }
	] as const;

	// A status filter that lives in the page: it narrows what is on screen and nothing else, so
	// it does not belong in the URL beside the filters that change what the data means.
	let showing = $state<string | null>(null);
	const counts = $derived(
		Object.fromEntries(
			STATUSES.map((status) => [
				status.id,
				data.sources.filter((source) => source.status === status.id).length
			])
		)
	);
	const shown = $derived(
		showing ? data.sources.filter((source) => source.status === showing) : data.sources
	);
	const loaded = $derived(data.sources.filter((source) => source.status !== 'not_loaded').length);
</script>

<svelte:head>
	<title>TrustScore Atlas: Sources</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Registers Atlas reads"
		lede="Every register in this country pack, with its licence, its cadence, when it was last pulled and when the scheduled refresh pulls it next. A register that has never been pulled is never counted as checked."
		meta={[scopeLine('Registers for', data.countryName, loaded, data.sources.length)]}
	/>

	<!-- The four states, as filters: a reader who came to ask "what is stale" starts there. -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each STATUSES as status (status.id)}
			<button
				type="button"
				class="flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors duration-120 {showing ===
				status.id
					? 'border-accent bg-accent-tint'
					: 'border-border bg-surface hover:border-border-strong'}"
				aria-pressed={showing === status.id}
				onclick={() => (showing = showing === status.id ? null : status.id)}
			>
				<StatTile label={status.label} value={counts[status.id] ?? 0} caption={status.caption} />
			</button>
		{/each}
	</div>

	{#if showing}
		<p class="text-xs text-ink-muted">
			Showing {STATUSES.find((status) => status.id === showing)?.label.toLowerCase()} registers only.
			<button
				type="button"
				class="underline transition-colors duration-120 hover:text-ink"
				onclick={() => (showing = null)}>Show all</button
			>
		</p>
	{/if}

	{#if data.sources.length === 0}
		<Callout tone="info" title="No register declared for this pack yet">
			This pack has no sources in the published regeneration.
		</Callout>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each shown as source (source.slug)}
				{@const when = formatWhen(source.last_run_at, { showTime: false })}
				<li class="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="flex min-w-0 flex-col gap-1">
							<span class="flex flex-wrap items-center gap-2">
								<RegisterBadge slug={source.slug} muted={source.status === 'not_loaded'} />
								<a
									href={source.url}
									class="inline-flex items-center gap-1 text-base text-ink underline"
									target="_blank"
									rel="external noreferrer"
								>
									{source.title}
									<ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
								</a>
							</span>
							<span class="text-xs text-ink-muted">
								{source.publisher} &middot; {source.licence} &middot; {source.cadence}
							</span>
						</div>
						<FreshnessBadge
							status={source.status}
							lastRunAt={source.last_run_at}
							cadence={source.cadence}
						/>
					</div>

					<dl class="grid gap-3 text-xs sm:grid-cols-3">
						<div class="flex flex-col">
							<dt class="text-ink-muted">Last accepted run</dt>
							<dd class="tnum text-ink" title={source.last_run_at ?? undefined}>
								{when ? when.text : 'never'}
							</dd>
						</div>
						<div class="flex flex-col">
							<dt class="text-ink-muted">Next due</dt>
							<dd class="tnum text-ink">
								{formatWhen(nextScheduledRun(source.cadence, source.last_run_at), {
									showTime: false
								})?.absolute ?? nextScheduledRun(source.cadence, source.last_run_at)}
							</dd>
						</div>
						<div class="flex flex-col">
							<dt class="text-ink-muted">Rows in the last run</dt>
							<dd class="tnum text-ink">
								{source.row_count === null ? 'none yet' : source.row_count.toLocaleString()}
							</dd>
						</div>
					</dl>

					{#if source.status_note}
						<Callout
							tone={source.status === 'failed'
								? 'error'
								: source.status === 'stale'
									? 'warning'
									: 'info'}
						>
							{source.status_note}
						</Callout>
					{/if}

					<details class="text-xs text-ink-muted">
						<summary class="w-fit cursor-pointer">What Atlas records about this register</summary>
						<dl class="mt-2 grid gap-2 sm:grid-cols-2">
							<div class="flex gap-2">
								<dt>Slug</dt>
								<dd class="font-mono text-2xs text-ink">{source.slug}</dd>
							</div>
							<div class="flex gap-2">
								<dt>Adapter version</dt>
								<dd class="tnum text-ink">{source.adapter_version ?? 'not written yet'}</dd>
							</div>
							<div class="flex gap-2">
								<dt>Short name</dt>
								<dd class="text-ink">{describeRegister(source.slug).short}</dd>
							</div>
							<div class="flex gap-2">
								<dt>Kind</dt>
								<dd class="text-ink">{describeRegister(source.slug).kind}</dd>
							</div>
						</dl>
					</details>
				</li>
			{/each}
		</ul>
	{/if}
</div>
