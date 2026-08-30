<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { Tabs } from 'bits-ui';
	import Copy from '@lucide/svelte/icons/copy';
	import Flag from '@lucide/svelte/icons/flag';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { organizationJsonLd } from '$lib/structured-data';
	import {
		displayFieldValue,
		formatFieldLabel,
		formatWhen,
		humaniseValue,
		identifierKey
	} from '$lib/format';
	import { describeRegister } from '$lib/registers';
	import { scoreEarnedAndMissing } from '$lib/measures';
	import { INTENTS, intentById, missingFor, uncheckedFor } from '$lib/record-intents';
	import { showToast } from '$lib/components/toast-state.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import CoverageBar from '$lib/components/CoverageBar.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import EvidenceRow from '$lib/components/EvidenceRow.svelte';
	import IdentifierChips from '$lib/components/IdentifierChips.svelte';
	import RegisterBadge from '$lib/components/RegisterBadge.svelte';
	import FreshnessBadge from '$lib/components/FreshnessBadge.svelte';
	import ScoreBar from '$lib/components/ScoreBar.svelte';
	import type { Column } from '$lib/components/table';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const record = $derived(data.record);
	const provenance = $derived(data.provenance);

	// The intent lives in the page, not the URL: it changes emphasis, and a shared link should
	// open on the record itself rather than on someone else's reason for reading it.
	let intentId = $state('overview');
	const intent = $derived(intentById(intentId));
	const missing = $derived(missingFor(intent, record.coverage.found_in, record.coverage.checked));
	const unchecked = $derived(uncheckedFor(intent, record.coverage.checked));

	// The newest thing any register has said about this business. A record whose newest statement
	// is a year old deserves to say so before anyone leans on it.
	const newest = $derived(
		formatWhen(
			provenance.map((row) => row.asserted_at).sort((a, b) => b.localeCompare(a))[0] ?? null,
			{ showTime: false }
		)
	);

	// A licence is not a registration. Uganda's company register is not among the loaded sources,
	// so the page says so rather than letting a trading licence stand in for one.
	const legalRegisterChecked = $derived(
		record.coverage.checked.some((slug) => slug.startsWith('ursb.'))
	);

	const columns: Column[] = [
		{ key: 'field', label: 'Field', primary: true },
		{ key: 'value', label: 'Published value', primary: true },
		{ key: 'source', label: 'Register' },
		{ key: 'asserted_at', label: 'Asserted' },
		{ key: 'precedence', label: 'Rank', numeric: true, align: 'end' }
	];

	// A synthetic scheme is our key for a register row. It stays in the API and in the provenance
	// table, where it is labelled, but a list headed "identifiers on file" may not offer it.
	const shownIdentifiers = $derived(record.identifiers.filter((entry) => !entry.synthetic));
	const listingKeys = $derived(record.identifiers.length - shownIdentifiers.length);

	// One evaluation line for the panel: four bars from one regeneration were evaluated at one
	// moment, and repeating it under each of them says nothing four times.
	const evaluated = $derived(
		formatWhen(record.scores[0]?.evaluation_as_of ?? null, { showTime: false })?.text
	);

	// The closing tag is split so this string cannot end the block that renders it.
	const organizationTag = $derived(
		`<script type="application/ld+json">${organizationJsonLd(record, page.url.origin)}</` +
			`script>`
	);

	const rubricLabel = (rubric: string) =>
		rubric.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

	async function copyId() {
		try {
			await navigator.clipboard.writeText(record.atlas_id);
			showToast(`Copied ${record.atlas_id}`, 'success');
		} catch {
			showToast('Your browser would not let the page copy that', 'error');
		}
	}
</script>

<svelte:head>
	<title>TrustScore Atlas: {record.canonical_name}</title>
	<meta
		name="description"
		content={`${record.canonical_name}: ${record.coverage_summary}. Every value on this record cites the register that published it.`}
	/>
	<!-- What this record says about itself to a reader that is not a person: the same name,
	     identifiers and location the page shows, and nothing the registers did not publish. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html organizationTag}
</svelte:head>

<div class="flex flex-col gap-8 xl:grid xl:grid-cols-12 xl:gap-8">
	<div class="flex flex-col gap-8 xl:col-span-8">
		<!-- Identity: who this is, and which registers carry them. -->
		<section class="flex flex-col gap-3 rounded-md border border-border bg-panel p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex min-w-0 flex-col gap-1">
					<h1 class="font-display text-2xl text-ink">{record.canonical_name}</h1>
					<p class="text-base text-ink-muted">
						{record.entity_kind} &middot; {record.location}
						{#if record.sector_category}
							&middot; {humaniseValue(record.sector_category)}{record.sector_nature
								? ` / ${humaniseValue(record.sector_nature)}`
								: ''}
						{/if}
					</p>
				</div>
				<span class="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted">
					{record.country}
				</span>
			</div>

			<p class="flex items-center gap-2 font-mono text-2xs text-ink-muted">
				{record.atlas_id}
				<button
					type="button"
					class="rounded-sm transition-colors duration-120 hover:text-ink"
					aria-label="Copy the atlas_id"
					onclick={copyId}
				>
					<Copy size={14} strokeWidth={1.5} />
				</button>
			</p>

			<IdentifierChips identifiers={record.identifiers} copyable />

			{#if record.coverage.found_in.length > 0}
				<ul class="flex flex-wrap gap-2">
					{#each record.coverage.found_in as slug (slug)}
						<li><RegisterBadge {slug} /></li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Why you are here. Emphasis and wording only: the evidence below does not move. -->
		<section class="flex flex-col gap-3">
			<Tabs.Root bind:value={intentId}>
				<Tabs.List class="flex flex-wrap gap-1 border-b border-border">
					{#each INTENTS as item (item.id)}
						<Tabs.Trigger
							value={item.id}
							class="rounded-t-sm px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-120 hover:text-ink data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-ink"
						>
							{item.label}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</Tabs.Root>

			<p class="font-display text-xl text-ink">{intent.question}</p>
			<p class="max-w-prose text-base text-ink-muted">{record.coverage_summary}.</p>

			<div class="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-muted">
				{#if newest}
					<p>Newest supporting record: <span class="tnum text-ink">{newest.absolute}</span></p>
				{/if}
				{#if !legalRegisterChecked}
					<p>Legal registration: not checked, no company register is loaded yet.</p>
				{/if}
			</div>

			{#if missing.length > 0 || unchecked.length > 0}
				<Callout tone="warning" title="What this record does not show">
					{#if missing.length > 0}
						<p>
							Checked and not found in {missing
								.map((slug) => describeRegister(slug).short)
								.join(', ')}.
						</p>
					{/if}
					{#if unchecked.length > 0}
						<p>
							Not yet checked against {unchecked
								.map((slug) => describeRegister(slug).short)
								.join(', ')}.
						</p>
					{/if}
				</Callout>
			{/if}
		</section>

		<!-- Scores: the quantities on one track, with what was checked underneath. -->
		<section class="flex flex-col gap-4">
			<h2 class="text-xl font-semibold text-ink">Scores</h2>
			{#if record.scores.length > 0}
				<div class="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
					<p class="text-xs text-ink-muted">
						{record.coverage_summary}.{evaluated ? ` Evaluated ${evaluated}.` : ''}
					</p>
					{#each record.scores as score (score.rubric + score.version)}
						{@const parts = scoreEarnedAndMissing(score.evidence)}
						<div class="flex flex-col gap-1">
							<ScoreBar {score} />
							<p class="text-xs text-ink-muted">
								{#if parts.earned.length > 0}Earned: {parts.earned.join(', ')}.{/if}
								{#if parts.missing.length > 0}Missing: {parts.missing.join(', ')}.{/if}
							</p>
						</div>
					{/each}
					<div class="flex flex-col gap-2 border-t border-border pt-4">
						<p class="text-xs font-medium text-ink-muted">Register coverage</p>
						<CoverageBar coverage={record.coverage} summary={record.coverage_summary} showLegend />
					</div>
				</div>

				<!-- The working behind each score, so an unchecked predicate is never a zero. -->
				{#each record.scores as score (score.rubric + '-evidence')}
					<details class="rounded-md border border-border bg-surface p-4">
						<summary class="cursor-pointer text-base font-medium text-ink">
							How {rubricLabel(score.rubric)} was worked out
						</summary>
						<div class="mt-3">
							{#each score.evidence as item (item.predicate)}
								<EvidenceRow
									{item}
									traceHref={item.field
										? resolve('/b/[atlas_id]/trace/[field]', {
												atlas_id: record.atlas_id,
												field: item.field
											})
										: undefined}
								/>
							{/each}
						</div>
					</details>
				{/each}
			{:else}
				<Callout tone="info" title="No score yet">
					No rubric has been evaluated for this record in the published regeneration.
				</Callout>
			{/if}
		</section>

		<!-- Provenance: the winning value per field, and how to see the rest. -->
		<section class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">Where each value came from</h2>
			<p class="max-w-prose text-base text-ink-muted">
				One row per field: the value Atlas publishes, the register that supplied it, and its rank in
				this country pack's precedence order.
			</p>
			<DataTable {columns} rows={provenance} caption="Published value per field with its register">
				{#snippet cell({ row, column })}
					{#if column.key === 'field'}
						{formatFieldLabel(row.field)}
					{:else if column.key === 'value'}
						<span class="text-ink">{displayFieldValue(row.field, row.value)}</span>
						<a
							class="ml-2 text-xs whitespace-nowrap text-ink-muted underline hover:text-ink"
							href={row.reference.trace_url}>all statements</a
						>
					{:else if column.key === 'source'}
						{#if row.reference.source_url}
							<a
								class="text-ink underline"
								href={row.reference.source_url}
								target="_blank"
								rel="external noreferrer">{describeRegister(row.source).short}</a
							>
						{:else}
							<span class="text-ink">{describeRegister(row.source).short}</span>
						{/if}
						<span class="block text-2xs text-ink-muted">{row.reference.source_ref_label}</span>
					{:else if column.key === 'asserted_at'}
						<span class="tnum" title={row.asserted_at}
							>{formatWhen(row.asserted_at, { showTime: false })?.absolute}</span
						>
					{:else}
						{row.precedence}
					{/if}
				{/snippet}
			</DataTable>
		</section>

		<!-- Sources: how current each register behind this record is. -->
		<section class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">Registers behind this record</h2>
			<ul class="flex flex-col gap-2">
				{#each record.sources as source (source.slug)}
					<li
						class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3"
					>
						<span class="flex flex-wrap items-center gap-2">
							<RegisterBadge slug={source.slug} />
							<a
								href={source.url}
								class="text-base text-ink underline"
								target="_blank"
								rel="external noreferrer">{source.title}</a
							>
							<span class="text-xs text-ink-muted">{source.publisher} · {source.licence}</span>
						</span>
						<FreshnessBadge
							status={source.status}
							lastRunAt={source.last_run_at}
							cadence={source.cadence}
						/>
					</li>
				{/each}
			</ul>
		</section>

		<!--
			Report a problem. The form stays in the page rather than inside a dialog: its
			toolname and toolparamdescription attributes make it a tool the browser offers to an
			agent, and a form that exists only once a dialog opens is a tool that does not exist.
		-->
		<section class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">Something wrong with this record?</h2>
			<div class="flex flex-wrap gap-3">
				<a
					href={resolve('/claim/[atlas_id]', { atlas_id: record.atlas_id })}
					class="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-border-strong hover:bg-panel"
				>
					Claim this business
				</a>
			</div>
			<details class="rounded-md border border-border bg-surface p-4">
				<summary class="flex cursor-pointer items-center gap-2 text-base font-medium text-ink">
					<Flag size={20} strokeWidth={1.5} aria-hidden="true" />
					Report a problem with this record
				</summary>
				<form
					method="post"
					action={resolve('/api/v1/issues')}
					class="mt-3 flex max-w-prose flex-col gap-3"
					toolname="report_issue_form"
					tooldescription="Report a problem with the business record on this page. The report is recorded as unconfirmed and a confirmation page follows; maintainers review confirmed reports."
				>
					<input
						type="hidden"
						name="atlas_id"
						value={record.atlas_id}
						toolparamdescription="Opaque atlas_id of the business on this page."
					/>
					<label class="flex flex-col gap-1">
						<span class="text-xs font-medium text-ink-muted">What is wrong</span>
						<textarea
							name="description"
							required
							minlength="10"
							maxlength="2000"
							rows="3"
							toolparamdescription="What is wrong with the record, in plain words, 10 to 2000 characters."
							class="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink transition-colors duration-120 hover:border-border-strong"
						></textarea>
					</label>
					<button
						type="submit"
						class="h-10 w-fit rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
					>
						Send report
					</button>
				</form>
			</details>
		</section>
	</div>

	<!-- The rail repeats nothing: it carries what a reader must not forget while scrolling. -->
	<aside class="flex flex-col gap-4 xl:sticky xl:top-6 xl:col-span-4 xl:self-start">
		<Callout tone="info" title="This is not a credit verdict">
			Atlas reports what public registers publish, with the date and the register beside every
			value. It does not rate, verify or endorse a business.
		</Callout>
		<div class="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
			<p class="text-xs font-medium text-ink-muted">
				{intent.id === 'overview'
					? 'Reading this for a reason?'
					: `Reading this for ${intent.label.toLowerCase()}`}
			</p>
			<p class="text-base text-ink">
				{#if intent.id === 'overview'}
					Pick a view above and this panel says what that reader can and cannot conclude from the
					record.
				{:else}
					{intent.limit}
				{/if}
			</p>
		</div>
		{#if shownIdentifiers.length > 0}
			<div class="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
				<p class="text-xs font-medium text-ink-muted">
					Identifiers on file
					<span class="tnum">({shownIdentifiers.length})</span>
				</p>
				<ul class="flex flex-col gap-1 font-mono text-2xs text-ink">
					{#each shownIdentifiers.slice(0, 6) as identifier (identifierKey(identifier))}
						<li>
							{identifier.scheme}: {identifier.value}
							<span class="text-ink-muted">({describeRegister(identifier.source).short})</span>
						</li>
					{/each}
				</ul>
				{#if listingKeys > 0}
					<p class="text-2xs text-ink-muted">
						Plus <span class="tnum">{listingKeys}</span>
						{listingKeys === 1 ? 'listing key' : 'listing keys'}, which are Atlas's keys for
						register rows rather than numbers a register issued.
					</p>
				{/if}
				{#if shownIdentifiers.length > 6}
					<details>
						<summary class="cursor-pointer text-xs text-ink-muted hover:text-ink">
							Show the other {shownIdentifiers.length - 6}
						</summary>
						<ul class="mt-2 flex flex-col gap-1 font-mono text-2xs text-ink">
							{#each shownIdentifiers.slice(6) as identifier (identifierKey(identifier))}
								<li>
									{identifier.scheme}: {identifier.value}
									<span class="text-ink-muted">({describeRegister(identifier.source).short})</span>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
	</aside>
</div>
