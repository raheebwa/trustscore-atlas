<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { humaniseValue } from '$lib/format';
	import { scopeLine } from '$lib/scope';
	import Callout from '$lib/components/Callout.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PrecedenceLadder from '$lib/components/PrecedenceLadder.svelte';
	import RegisterBadge from '$lib/components/RegisterBadge.svelte';
	import type { Column } from '$lib/components/table';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const published = $derived(data.methodology.published);
	const linkage = $derived(data.methodology.linkage);

	// The pack in view: bindings and precedence differ per country, and showing all of them at
	// once is how a reader ends up quoting Uganda's rules for a Kenyan record.
	const pack = $derived(published?.packs?.[data.country]);

	const SECTIONS = [
		{ id: 'not', label: 'What a score is not' },
		{ id: 'rubrics', label: 'Rubrics' },
		{ id: 'bindings', label: 'What this pack binds' },
		{ id: 'precedence', label: 'When registers disagree' },
		{ id: 'linkage', label: 'How records are linked' },
		{ id: 'provenance', label: 'Provenance' }
	];

	const predicateColumns: Column[] = [
		{ key: 'id', label: 'Predicate', mono: true, primary: true },
		{ key: 'points', label: 'Points', numeric: true, align: 'end' },
		{ key: 'meaning', label: 'What it asks', primary: true }
	];

	/** The registers a pack binds to one predicate, or nothing when it binds none. */
	function boundRegisters(binding: Record<string, unknown> | undefined): string[] {
		if (!binding) return [];
		const registers: string[] = [];
		for (const value of Object.values(binding)) {
			const items = Array.isArray(value) ? value : [value];
			for (const item of items) {
				const slug = String(item);
				// A binding names registers by slug; other keys carry thresholds and notes.
				if (slug.includes('.') && !registers.includes(slug)) registers.push(slug);
			}
		}
		return registers;
	}

	const precedenceRanks = $derived(
		Object.entries(pack?.precedence ?? {})
			.map(([label, rank]) => ({
				rank: Number(rank),
				label: humaniseValue(label),
				explanation: `Statements from a ${humaniseValue(label).toLowerCase()} source take rank ${rank}.`
			}))
			.sort((a, b) => a.rank - b.rank)
	);
</script>

<svelte:head>
	<title>TrustScore Atlas: Methodology</title>
</svelte:head>

<div class="flex flex-col gap-6 xl:grid xl:grid-cols-12 xl:gap-8">
	<!-- A table of contents that stays put: this page is read in pieces, by people checking one
	     claim at a time. -->
	<nav class="text-xs xl:sticky xl:top-6 xl:col-span-3 xl:self-start" aria-label="On this page">
		<p class="font-medium text-ink-muted">On this page</p>
		<ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 xl:flex-col">
			{#each SECTIONS as section (section.id)}
				<li>
					<a
						href={`#${section.id}`}
						class="text-ink-muted underline transition-colors duration-120 hover:text-ink"
						>{section.label}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="flex max-w-reading flex-col gap-8 xl:col-span-9">
		<PageHeader
			title="Methodology"
			lede="How Atlas turns public registers into linked business records and scored evidence. Everything on this page is read from the same regeneration that serves the site, so it describes exactly what scored the records you are looking at."
			meta={[scopeLine('Bindings for', data.countryName, data.registersLoaded)]}
		/>

		<p class="max-w-prose text-base text-ink-muted">
			Public business registers, harmonised, with every value cited: one record per business, each
			field carrying the register that published it and the date it said so, with what has not been
			checked shown as plainly as what has.
		</p>

		<section id="not" class="flex flex-col gap-3">
			<Callout tone="warning" title="What a score is not">
				A score counts public-register facts against a published rubric. It is not a credit
				assessment, a fraud verdict, or a statement that a business is trustworthy. A low score
				usually means the registers were quiet about that business, not that anything is wrong,
				which is why every score carries what was checked beside it.
			</Callout>
		</section>

		<section id="rubrics" class="flex flex-col gap-4">
			<h2 class="text-xl font-semibold text-ink">Rubrics</h2>
			{#if published && published.rubrics.length > 0}
				{#each published.rubrics as rubric (rubric.name)}
					<div class="flex flex-col gap-2">
						<h3 class="text-lg font-semibold text-ink">
							{rubric.title}
							<span class="tnum text-xs font-normal text-ink-muted">
								version {rubric.version} &middot; out of {rubric.max} &middot; {rubric.licence}
							</span>
						</h3>
						<p class="text-base text-ink-muted">{rubric.question}</p>
						<DataTable
							columns={predicateColumns}
							rows={rubric.predicates.map((predicate) => ({
								id: predicate.id,
								points: predicate.points,
								meaning: predicate.meaning ?? predicate.question ?? ''
							}))}
							caption={`Predicates in the ${rubric.title} rubric`}
						/>
					</div>
				{/each}
			{:else}
				<Callout tone="info" title="Rubrics arrive with the next regeneration">
					The serving database predates the published rubric definitions.
				</Callout>
			{/if}
		</section>

		<section id="bindings" class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">What this pack binds to each predicate</h2>
			<p class="text-base text-ink-muted">
				A rubric is abstract. A country pack binds each predicate to the registers that can answer
				it here, and a predicate with no binding is not a zero: it is a question this pack cannot
				ask yet, which is what the hatched mass on a score bar means.
			</p>
			<p class="text-base text-ink-muted">
				Registers are added as code, in the repository, not through this site.
			</p>
			<p class="text-base text-ink-muted" id="operator-statements">
				One source is not a register. When a claimant proves they control the business's website, or
				opens a link Atlas mails to a domain a register published for the record, and a maintainer
				then approves the claim, what they assert is published as an operator statement at the top
				of the precedence order. It wins the field it is about, carries the claim it came from, and
				appears on the record like any other value, with its own source beside it.
			</p>
			{#if pack}
				{#each Object.entries(pack.bindings) as [rubricName, predicates] (rubricName)}
					<div class="flex flex-col gap-2">
						<h3 class="text-lg font-semibold text-ink">{humaniseValue(rubricName)}</h3>
						<ul class="flex flex-col gap-2">
							{#each Object.entries(predicates) as [predicateId, binding] (predicateId)}
								{@const registers = boundRegisters(binding as Record<string, unknown>)}
								<li
									class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3"
								>
									<span class="font-mono text-2xs text-ink">{predicateId}</span>
									{#if registers.length > 0}
										{#each registers as slug (slug)}
											<RegisterBadge {slug} />
										{/each}
									{:else}
										<span
											class="inline-flex items-center rounded-md border border-border hatch px-2 py-1 text-xs text-ink-muted"
										>
											not checked in this pack
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{:else}
				<Callout tone="info" title="This pack publishes no bindings yet">
					Its registers are listed on the sources page; nothing scores against them until the pack
					binds them to a rubric.
				</Callout>
			{/if}
		</section>

		<section id="precedence" class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">When registers disagree</h2>
			<p class="text-base text-ink-muted">
				Registers contradict each other, and Atlas publishes one value per field. The pack's
				precedence order decides which class of source wins; within a class, the value with more
				distinct source records wins, then the more recent assertion. Every field's trace page shows
				the losing statements too.
			</p>
			{#if precedenceRanks.length > 0}
				<PrecedenceLadder ranks={precedenceRanks} />
			{/if}
		</section>

		<section id="linkage" class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">How records are linked</h2>
			<p class="text-base text-ink-muted">
				Two register rows become one business only on an issuer-unique identifier shared by both, a
				tax identification number for example, or on a maintainer-verified match. Name similarity
				alone never merges records: it produces candidates, which a maintainer labels match or
				non-match. Labels are append-only and the latest verdict per pair wins.
			</p>
			<p class="text-base text-ink-muted">
				A match label is given only for an exactly equal normalised legal name across two different
				issuers, with no contradicting legal suffix or sector class. A legal name licensed in
				several divisions of one city is one business with several premises.
			</p>
			<div class="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
				<p class="text-xs font-medium text-ink-muted">In the live regeneration</p>
				<ul class="flex flex-col gap-1 text-base text-ink">
					<li>
						<span class="tnum">{linkage.candidate.toLocaleString()}</span> name candidates below the review
						band
					</li>
					<li>
						<span class="tnum">{linkage.review.toLocaleString()}</span> in the review band, waiting on
						a maintainer
					</li>
					<li>
						<span class="tnum">{linkage.likely.toLocaleString()}</span> above the review band
						{#if linkage.likely === 0}
							<span class="text-xs text-ink-muted">
								(empty by design: the name model is not allowed to merge on its own)
							</span>
						{/if}
					</li>
					<li>
						<span class="tnum">{linkage.identifier_merges.toLocaleString()}</span> records linked by
						a shared identifier, and
						<span class="tnum">{linkage.labelled_matches.toLocaleString()}</span>
						by a maintainer's label
					</li>
				</ul>
			</div>
		</section>

		<section id="provenance" class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold text-ink">Provenance</h2>
			<p class="text-base text-ink-muted">
				Every value on a business page is a statement carrying its register, the reference it was
				read from, when it was asserted, its licence and its precedence class. The trace link on
				each field shows the competing statements and why one won. Raw pulls are kept immutable, and
				a re-run on the same raw input is byte-identical, so a value can always be traced back to
				the bytes a register published.
			</p>
		</section>
	</div>
</div>
