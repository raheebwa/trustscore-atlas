<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const published = $derived(data.methodology.published);
	const linkage = $derived(data.methodology.linkage);

	function bindingSummary(binding: Record<string, unknown>): string {
		const parts: string[] = [];
		for (const [key, value] of Object.entries(binding)) {
			if (Array.isArray(value)) {
				parts.push(value.length > 0 ? `${key}: ${value.join(', ')}` : `${key}: none`);
			} else if (value !== null && value !== undefined) {
				parts.push(`${key}: ${String(value)}`);
			}
		}
		return parts.join('; ');
	}

	function isBound(binding: Record<string, unknown>): boolean {
		return Object.values(binding).some((value) => (Array.isArray(value) ? value.length > 0 : true));
	}
</script>

<svelte:head>
	<title>TrustScore Atlas: Methodology</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Methodology</h1>
<p class="mt-2 max-w-3xl text-stone-600">
	How the atlas turns public registers into linked business records and scored evidence. Everything
	on this page is read from the same regeneration that serves the site, so it describes exactly what
	scored the records you see.
</p>

<section class="mt-8 max-w-3xl">
	<h2 class="text-lg font-semibold text-stone-900">What a score is not</h2>
	<p class="mt-2 text-stone-700">
		A score is a count of public-register facts against a published rubric. It is not a credit
		score, not a fraud verdict, not a recommendation and not a statement about any person.
		Predicates the atlas could not check in a country are reported as unknown and never as zero, and
		every score carries its coverage sentence ("found in 3 of 8 checked; 4 not yet checked")
		wherever it appears, on the site and in every tool result.
	</p>
</section>

<section class="mt-8 max-w-3xl">
	<h2 class="text-lg font-semibold text-stone-900">Rubrics</h2>
	{#if published}
		<div class="mt-3 flex flex-col gap-4">
			{#each published.rubrics as rubric (rubric.name)}
				<article class="rounded-lg border border-stone-200 bg-white p-4">
					<h3 class="font-semibold text-stone-900">
						{rubric.title}
						<span class="ml-2 text-sm font-normal text-stone-500"
							>version {rubric.version}, out of {rubric.max}, {rubric.licence}</span
						>
					</h3>
					<p class="mt-1 text-sm text-stone-600">{rubric.question}</p>
					<table class="mt-3 w-full text-left text-sm">
						<thead class="text-stone-500">
							<tr
								><th class="py-1 pr-3 font-medium">Predicate</th><th class="py-1 pr-3 font-medium"
									>Points</th
								><th class="py-1 font-medium">Meaning</th></tr
							>
						</thead>
						<tbody>
							{#each rubric.predicates as predicate (predicate.id)}
								<tr class="border-t border-stone-100">
									<td class="py-1 pr-3 font-mono text-xs text-stone-700">{predicate.id}</td>
									<td class="py-1 pr-3 text-stone-700">{predicate.points}</td>
									<td class="py-1 text-stone-700">{predicate.description}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</article>
			{/each}
		</div>
	{:else}
		<p class="mt-2 text-sm text-amber-700">
			The serving database predates the published rubric definitions; they appear with the next
			regeneration.
		</p>
	{/if}
</section>

{#if published}
	<section class="mt-8 max-w-3xl">
		<h2 class="text-lg font-semibold text-stone-900">What each country binds to a predicate</h2>
		<p class="mt-2 text-stone-700">
			A rubric is abstract; a country pack binds each predicate to the registers that can answer it.
			An unbound predicate is "not checked" in that country, so scores are comparable only within a
			country.
		</p>
		{#each Object.entries(published.packs) as [code, pack] (code)}
			<h3 class="mt-4 font-semibold text-stone-900">{pack.name ?? code} ({code})</h3>
			{#if pack.identifier_schemes && Object.keys(pack.identifier_schemes).length > 0}
				<p class="mt-1 text-sm text-stone-600">
					Identifiers that link records:
					{Object.entries(pack.identifier_schemes)
						.filter(([, spec]) => spec.issuer_unique)
						.map(([scheme, spec]) => `${scheme} (${spec.issuer ?? spec.title ?? 'issuer unknown'})`)
						.join(', ') || 'none are issuer-unique'}.
				</p>
			{:else}
				<p class="mt-1 text-sm text-stone-600">
					The registers in this pack publish no identifier, so its records are keyed by name only
					and are never merged with one another or with another country's records.
				</p>
			{/if}
			<ul class="mt-2 flex flex-col gap-1 text-sm text-stone-700">
				{#each Object.entries(pack.bindings) as [rubricName, predicates] (rubricName)}
					{#each Object.entries(predicates) as [predicateId, binding] (predicateId)}
						<li>
							<span class="font-mono text-xs">{rubricName}.{predicateId}</span>:
							{#if isBound(binding)}{bindingSummary(binding)}{:else}<span class="text-stone-500"
									>not checked in this country</span
								>{/if}
						</li>
					{/each}
				{/each}
			</ul>
			<p class="mt-2 text-sm text-stone-600">
				Precedence when registers disagree (lower wins): {Object.entries(pack.precedence)
					.sort((a, b) => a[1] - b[1])
					.map(([name, rank]) => `${name} (${rank})`)
					.join(', ')}.
			</p>
		{/each}
	</section>
{/if}

<section class="mt-8 max-w-3xl">
	<h2 class="text-lg font-semibold text-stone-900">How records are linked</h2>
	<p class="mt-2 text-stone-700">
		Two register rows become one business only on an issuer-unique identifier shared by both (a tax
		identification number, for example) or on a maintainer-verified match. Name similarity alone
		never merges records: it produces candidates, which the site shows as "possibly the same
		business" and a maintainer labels match or non-match. Labels are append-only and the latest
		verdict per pair wins.
	</p>
	<p class="mt-2 text-stone-700">
		The labelling rule in force: a match label is given only for an exactly equal normalised legal
		name across two different issuers with no contradicting legal suffix or sector class; a legal
		name licensed in several divisions of one city is one entity with several premises. Every
		business whose registers were joined this way says "linked by a maintainer-verified match" on
		its page.
	</p>
	{#if published}
		<p class="mt-2 text-sm text-stone-600">{published.linkage.rule}</p>
	{/if}
	<p class="mt-2 text-stone-700">
		In the live regeneration: {linkage.candidate.toLocaleString()} name candidates between
		{published?.linkage.candidate_threshold ?? 0.5} and 0.80, {linkage.review.toLocaleString()} in the
		review band from 0.80 to 0.95, and {linkage.likely.toLocaleString()} at 0.95 or above
		{#if linkage.likely === 0}(the "likely the same business" band is empty: with expert-set name
			weights and no self-training, no pair reaches it, which is the intended behaviour of a model
			that is not allowed to merge){/if}. Records linked so far: {linkage.identifier_merges.toLocaleString()}
		by identifier and {linkage.labelled_matches.toLocaleString()} by maintainer label.
	</p>
</section>

<section class="mt-8 max-w-3xl">
	<h2 class="text-lg font-semibold text-stone-900">Provenance</h2>
	<p class="mt-2 text-stone-700">
		Every value on a business page is a statement with its source register, the reference it was
		read from, when it was asserted, its licence and its precedence class. The trace link on each
		field shows the competing statements and why one won. Raw pulls are kept immutable; a re-run on
		the same raw input is byte-identical.
	</p>
</section>
