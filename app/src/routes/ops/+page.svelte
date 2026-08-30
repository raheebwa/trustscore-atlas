<script lang="ts">
	import { formatWhen } from '$lib/format';
	// SPDX-License-Identifier: Apache-2.0
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Moderation queue</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-ink">Moderation queue</h1>
<p class="mt-1 text-sm text-ink-muted">
	Signed in as {data.maintainer}. Confirmed claims, corrections, linkage labels and issues waiting
	for a decision, oldest first. A decision is recorded once and never edits the request.
	<a href={resolve('/ops/sources')} class="underline">Sources</a>
	<a href={resolve('/ops/linkage')} class="underline">Linkage review</a>
	<a href={resolve('/ops/regeneration')} class="underline">Regeneration</a>
</p>

{#if form?.message}
	<p
		class="mt-4 rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-accent-ink"
	>
		{form.message}
	</p>
{:else if form?.decided}
	<p
		class="mt-4 rounded-md border border-success-fill bg-success-surface px-3 py-2 text-sm text-success-ink"
	>
		Recorded: {form.decided}
		{form.decision}.
	</p>
{/if}

{#if data.queue.length === 0}
	<p class="mt-6 text-ink-muted">Nothing waiting.</p>
{:else}
	<ul class="mt-6 flex flex-col gap-4">
		{#each data.queue as item (item.request_type + item.request_id)}
			<li class="rounded-lg border border-border bg-surface p-4 2xl:py-3">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<span class="font-medium text-ink">{item.request_type.replace('_', ' ')}</span>
					<span class="font-mono text-xs text-ink-muted">{item.request_id}</span>
				</div>
				<p class="mt-1 text-sm text-ink">{item.summary}</p>
				<p class="mt-1 text-xs text-ink-muted">
					{#if item.atlas_id}
						<a href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })} class="underline"
							>{item.atlas_id}</a
						>
						&middot;
					{/if}
					requested {formatWhen(item.requested_at)?.text} &middot; confirmed {item.confirmed_at
						? formatWhen(item.confirmed_at)?.text
						: 'not yet'}
				</p>
				{#if item.verification}
					{@const verification = item.verification}
					<div class="mt-3 rounded-md border border-border bg-panel-2 p-3 text-xs text-ink">
						<p>
							<span class="font-medium">
								{verification.state === 'verified' ? 'Verified' : 'Not verified'}
							</span>
							{#if verification.state === 'verified'}
								by {verification.method === 'domain_email' ? 'a mailed link' : 'a website string'} at
								<span class="font-mono">{verification.verified_domain}</span>.
								{#if verification.domain_matches_register}
									A register published that website for this record.
								{/if}
							{/if}
							{#if item.gate.reason}
								{item.gate.reason}
							{/if}
						</p>
						{#if verification.evidence.length > 0}
							<p class="mt-2">
								Documents:
								{#each verification.evidence as document, index (document.evidence_id)}
									{#if index > 0}&middot;{/if}
									<a
										href={resolve('/ops/claims/[claim_id]/evidence/[evidence_id]', {
											claim_id: document.claim_id,
											evidence_id: document.evidence_id
										})}
										class="underline">{document.uploaded_note || document.content_type}</a
									>
								{/each}
							</p>
						{:else}
							<p class="mt-2 text-ink-muted">No documents attached.</p>
						{/if}
					</div>
				{/if}
				<form
					method="post"
					action="?/decide"
					use:enhance
					class="mt-3 flex flex-wrap items-end gap-2"
				>
					<input type="hidden" name="request_type" value={item.request_type} />
					<input type="hidden" name="request_id" value={item.request_id} />
					<label class="flex flex-col text-xs text-ink-muted">
						Reason
						<input
							name="reason"
							required
							maxlength="500"
							class="mt-1 w-80 rounded-md border border-border-strong px-2 py-1 text-sm"
						/>
					</label>
					{#if item.gate.needs_relationship_review}
						{#if (item.verification?.evidence.length ?? 0) === 0}
							<p
								class="max-w-md rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-xs text-accent-ink"
							>
								No register published this domain and no document is attached. Approval rests on
								your reason alone.
							</p>
						{/if}
						<label class="flex max-w-md items-start gap-2 text-xs text-ink">
							<input type="checkbox" name="domain_relationship_reviewed" class="mt-0.5" />
							<span>
								Domain relationship reviewed: I checked what connects
								<span class="font-mono">{item.verification?.verified_domain}</span> to this
								business, and the reason above names it.
								<span class="text-ink-muted">
									({item.verification?.evidence.length ?? 0}
									{(item.verification?.evidence.length ?? 0) === 1 ? 'document' : 'documents'} attached)
								</span>
							</span>
						</label>
					{/if}
					<button
						name="decision"
						value="approved"
						disabled={!item.gate.approvable}
						title={item.gate.approvable ? undefined : (item.gate.reason ?? undefined)}
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink hover:bg-accent-ink"
					>
						Approve
					</button>
					<button
						name="decision"
						value="rejected"
						class="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-panel"
					>
						Reject
					</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
