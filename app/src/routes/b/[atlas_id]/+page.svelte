<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { identifierKey, summariseIdentifiers, formatWhen } from '$lib/format';
	import { resolve } from '$app/paths';
	import { formatFieldLabel } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let record = $derived(data.record);
	let provenance = $derived(data.provenance);
</script>

<svelte:head>
	<title>TrustScore Atlas: {record.canonical_name}</title>
</svelte:head>

<div class="flex flex-col gap-1">
	<h1 class="text-2xl font-semibold text-stone-900">{record.canonical_name}</h1>
	<p class="text-stone-600">
		{record.entity_kind} &middot; {record.location}
		{#if record.sector_category}
			&middot; {record.sector_category}{record.sector_nature ? `/${record.sector_nature}` : ''}
		{/if}
	</p>
	<p class="text-sm text-stone-400">atlas_id: {record.atlas_id}</p>
	<a
		href={resolve('/claim/[atlas_id]', { atlas_id: record.atlas_id })}
		class="mt-2 w-fit text-sm text-stone-600 underline">Request a claim</a
	>
</div>

<details class="mt-4 max-w-xl rounded-lg border border-stone-200 bg-white p-4">
	<summary class="cursor-pointer text-sm font-medium text-stone-800"
		>Report a problem with this record</summary
	>
	<form
		method="post"
		action={resolve('/api/v1/issues')}
		class="mt-3 space-y-3"
		toolname="report_issue_form"
		tooldescription="Report a problem with the business record on this page. The report is recorded as unconfirmed and a confirmation page follows; maintainers review confirmed reports."
	>
		<input
			type="hidden"
			name="atlas_id"
			value={record.atlas_id}
			toolparamdescription="Opaque atlas_id of the business on this page."
		/>
		<label class="block">
			<span class="block text-sm font-medium text-stone-700">What is wrong</span>
			<textarea
				name="description"
				required
				minlength="10"
				maxlength="2000"
				rows="3"
				toolparamdescription="What is wrong with the record, in plain words, 10 to 2000 characters."
				class="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"></textarea>
		</label>
		<button
			type="submit"
			class="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
		>
			Send report
		</button>
	</form>
</details>

<section class="mt-6">
	<h2 class="text-lg font-semibold text-stone-900">Identifiers</h2>
	{#if record.identifiers.length > 0}
		<ul class="mt-2 flex flex-wrap gap-2">
			{#each summariseIdentifiers(record.identifiers) as label (label)}
				<li class="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">{label}</li>
			{/each}
		</ul>
		<details class="mt-2 text-sm text-stone-600">
			<summary class="cursor-pointer"
				>All {record.identifiers.length} identifier rows with their registers</summary
			>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each record.identifiers as id (identifierKey(id))}
					<li class="rounded-full bg-white px-3 py-1 text-xs text-stone-600 ring-1 ring-stone-200">
						{id.scheme}: {id.value} <span class="text-stone-400">({id.source})</span>
					</li>
				{/each}
			</ul>
		</details>
	{:else}
		<p class="mt-2 text-sm text-stone-500">No identifiers on file.</p>
	{/if}
</section>

<section class="mt-6">
	<h2 class="text-lg font-semibold text-stone-900">Register coverage</h2>
	<p class="mt-2 text-stone-700">{record.coverage_summary}.</p>
	<dl class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<div>
			<dt class="text-xs font-medium tracking-wide text-stone-500 uppercase">Applicable</dt>
			<dd class="text-sm text-stone-700">{record.coverage.applicable.join(', ') || 'none'}</dd>
		</div>
		<div>
			<dt class="text-xs font-medium tracking-wide text-stone-500 uppercase">Checked</dt>
			<dd class="text-sm text-stone-700">{record.coverage.checked.join(', ') || 'none'}</dd>
		</div>
		<div>
			<dt class="text-xs font-medium tracking-wide text-stone-500 uppercase">Found in</dt>
			<dd class="text-sm text-stone-700">{record.coverage.found_in.join(', ') || 'none'}</dd>
		</div>
		<div>
			<dt class="text-xs font-medium tracking-wide text-stone-500 uppercase">Not yet checked</dt>
			<dd class="text-sm text-stone-700">
				{record.coverage.not_yet_checked.join(', ') || 'none'}
			</dd>
		</div>
	</dl>
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold text-stone-900">Scores</h2>
	<p class="mt-1 text-sm text-stone-500">
		Scores are not a credit or fraud verdict; see <a href={resolve('/sources')} class="underline"
			>the sources</a
		> each rests on.
	</p>
	{#if record.scores.length > 0}
		<div class="mt-3 flex flex-col gap-4">
			{#each record.scores as score (score.rubric + score.version + score.evaluation_as_of)}
				<div class="rounded-lg border border-stone-200 bg-white p-4">
					<div>
						<h3 class="text-base font-semibold text-stone-900 capitalize">
							{score.rubric} <span class="font-normal text-stone-500">v{score.version}</span>
						</h3>
						<p class="mt-1 text-base font-semibold text-stone-900">{score.summary}</p>
					</div>
					<p class="mt-1 text-sm text-stone-500">
						Score coverage: {score.coverage_summary}.
					</p>
					<div class="mt-3 overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead class="text-stone-500">
								<tr>
									<th class="py-1 pr-3 font-medium">Predicate</th>
									<th class="py-1 pr-3 font-medium">Points</th>
									<th class="py-1 pr-3 font-medium">As of</th>
									<th class="py-1 font-medium">Trace</th>
								</tr>
							</thead>
							<tbody>
								{#each score.evidence as row (row.predicate)}
									<tr class="border-t border-stone-100">
										<td class="py-1.5 pr-3 text-stone-800">{row.predicate}</td>
										<td class="py-1.5 pr-3 text-stone-800">{row.points}</td>
										<td class="py-1.5 pr-3 text-stone-600">{row.as_of ?? row.reason ?? '-'}</td>
										<td class="py-1.5">
											{#if row.field}
												<a
													href={resolve('/b/[atlas_id]/trace/[field]', {
														atlas_id: record.atlas_id,
														field: row.field
													})}
													class="text-stone-600 underline">view trace</a
												>
											{:else}
												<span class="text-stone-400">-</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="mt-2 text-xs text-stone-400">
						Evaluated {formatWhen(score.evaluation_as_of, { showTime: false })?.text}
					</p>
				</div>
			{/each}
		</div>
	{:else}
		<p class="mt-2 text-sm text-stone-500">No scores computed yet.</p>
	{/if}
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold text-stone-900">Field provenance</h2>
	<p class="mt-1 text-sm text-stone-500">
		The winning value per field, chosen by precedence, support, asserted date, normalised length,
		then raw value (docs on <a href={resolve('/sources')} class="underline">/sources</a>).
	</p>
	<div class="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
		<table class="w-full min-w-[40rem] text-left text-sm">
			<thead class="border-b border-stone-200 text-stone-500">
				<tr>
					<th class="px-4 py-2 font-medium">Field</th>
					<th class="px-4 py-2 font-medium">Value</th>
					<th class="px-4 py-2 font-medium">Source</th>
					<th class="px-4 py-2 font-medium">Asserted</th>
					<th class="px-4 py-2 font-medium">Precedence</th>
					<th class="px-4 py-2 font-medium">Trace</th>
				</tr>
			</thead>
			<tbody>
				{#each provenance as row (row.field)}
					<tr class="border-b border-stone-100 last:border-0">
						<td class="px-4 py-2 text-stone-900">{formatFieldLabel(row.field)}</td>
						<td class="px-4 py-2 text-stone-700">{row.value}</td>
						<td class="px-4 py-2">
							{#if row.reference.source_url}
								<a
									href={row.reference.source_url}
									class="text-stone-600 underline"
									target="_blank"
									rel="external noreferrer">{row.source}</a
								>
								<span class="block text-xs text-stone-500">{row.reference.source_ref_label}</span>
							{:else}
								<span class="text-stone-700">{row.source}</span>
								<span class="block text-xs text-stone-500">{row.reference.source_ref_label}</span>
							{/if}
						</td>
						<td class="px-4 py-2 text-stone-600" title={row.asserted_at}
							>{formatWhen(row.asserted_at, { showTime: false })?.absolute}</td
						>
						<td class="px-4 py-2 text-stone-600">{row.precedence}</td>
						<td class="px-4 py-2">
							<a
								href={resolve('/b/[atlas_id]/trace/[field]', {
									atlas_id: record.atlas_id,
									field: row.field
								})}
								class="text-stone-600 underline">all statements</a
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="mt-8">
	<h2 class="text-lg font-semibold text-stone-900">Sources</h2>
	<ul class="mt-3 flex flex-col gap-2">
		{#each record.sources as source (source.slug)}
			<li class="rounded-lg border border-stone-200 bg-white p-3 text-sm">
				<a
					href={source.url}
					class="font-medium text-stone-900 underline"
					target="_blank"
					rel="external noreferrer">{source.title}</a
				>
				<span class="text-stone-500">
					&middot; {source.publisher} &middot; {source.licence} &middot; last run {formatWhen(
						source.last_run_at,
						{ showTime: false }
					)?.text ?? 'never'}</span
				>
			</li>
		{/each}
	</ul>
</section>
