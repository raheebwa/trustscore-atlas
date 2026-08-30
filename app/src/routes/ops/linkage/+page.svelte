<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Linkage review</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-ink">Linkage review</h1>
<p class="mt-1 text-sm text-ink-muted">
	Signed in as {data.maintainer}. Name candidates between 0.80 and 0.95, strongest first, that no
	maintainer has labelled yet. A verdict is appended with your reason; the next regeneration
	compiles it into the labels file and the pair merges (match) or is kept apart (non_match). Name
	similarity alone never merges anything.
	<a href={resolve('/ops')} class="underline">Queue</a>
	<a href={resolve('/ops/sources')} class="underline">Sources</a>
</p>

{#if form?.message}
	<p
		class="mt-4 rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-accent-ink"
	>
		{form.message}
	</p>
{:else if form?.labelled}
	<p
		class="mt-4 rounded-md border border-success-fill bg-success-surface px-3 py-2 text-sm text-success-ink"
	>
		Recorded {form.verdict} for {form.labelled}.
	</p>
{/if}

{#if data.candidates.length === 0}
	<p class="mt-6 text-ink-muted">Nothing in the review band without a verdict.</p>
{:else}
	<ul class="mt-6 flex flex-col gap-4">
		{#each data.candidates as candidate (candidate.atlas_id_a + candidate.atlas_id_b)}
			<li class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-ink-muted">
					Name match probability {candidate.match_probability.toFixed(2)}
				</p>
				<div class="mt-2 grid gap-4 sm:grid-cols-2">
					{#each [candidate.a, candidate.b] as side (side.atlas_id)}
						<div class="rounded-md bg-canvas p-3">
							<a
								href={resolve('/b/[atlas_id]', { atlas_id: side.atlas_id })}
								class="font-medium text-ink underline">{side.name}</a
							>
							<p class="mt-1 text-sm text-ink-muted">
								{side.district ?? 'Unknown district'}{side.sector ? ` · ${side.sector}` : ''}
							</p>
							<p class="mt-1 text-xs text-ink-muted">
								{side.found_in.length > 0 ? side.found_in.join(', ') : 'no register listed'}
							</p>
							<p class="mt-1 font-mono text-xs text-ink-muted">{side.atlas_id}</p>
						</div>
					{/each}
				</div>
				<form
					method="post"
					action="?/label"
					use:enhance
					class="mt-3 flex flex-wrap items-end gap-2"
				>
					<input type="hidden" name="atlas_id" value={candidate.atlas_id_a} />
					<input type="hidden" name="candidate_atlas_id" value={candidate.atlas_id_b} />
					<label class="flex flex-col text-xs text-ink-muted">
						Reason
						<input
							name="reason"
							required
							maxlength="500"
							class="mt-1 w-80 rounded-md border border-border-strong px-2 py-1 text-sm"
						/>
					</label>
					<button
						name="verdict"
						value="match"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink hover:bg-accent-ink"
					>
						Match
					</button>
					<button
						name="verdict"
						value="non_match"
						class="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-panel"
					>
						Not a match
					</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
