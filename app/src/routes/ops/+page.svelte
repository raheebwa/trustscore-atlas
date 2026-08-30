<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Moderation queue</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Moderation queue</h1>
<p class="mt-1 text-sm text-stone-600">
	Signed in as {data.maintainer}. Confirmed claims, corrections, linkage labels and issues waiting
	for a decision, oldest first. A decision is recorded once and never edits the request.
	<a href={resolve('/ops/sources')} class="underline">Sources</a>
	<a href={resolve('/ops/linkage')} class="underline">Linkage review</a>
	<a href={resolve('/ops/regeneration')} class="underline">Regeneration</a>
</p>

{#if form?.message}
	<p class="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
		{form.message}
	</p>
{:else if form?.decided}
	<p
		class="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
	>
		Recorded: {form.decided}
		{form.decision}.
	</p>
{/if}

{#if data.queue.length === 0}
	<p class="mt-6 text-stone-500">Nothing waiting.</p>
{:else}
	<ul class="mt-6 flex flex-col gap-4">
		{#each data.queue as item (item.request_type + item.request_id)}
			<li class="rounded-lg border border-stone-200 bg-white p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<span class="font-medium text-stone-900">{item.request_type.replace('_', ' ')}</span>
					<span class="font-mono text-xs text-stone-500">{item.request_id}</span>
				</div>
				<p class="mt-1 text-sm text-stone-700">{item.summary}</p>
				<p class="mt-1 text-xs text-stone-500">
					{#if item.atlas_id}
						<a href={resolve('/b/[atlas_id]', { atlas_id: item.atlas_id })} class="underline"
							>{item.atlas_id}</a
						>
						&middot;
					{/if}
					requested {item.requested_at} &middot; confirmed {item.confirmed_at ?? 'n/a'}
				</p>
				<form
					method="post"
					action="?/decide"
					use:enhance
					class="mt-3 flex flex-wrap items-end gap-2"
				>
					<input type="hidden" name="request_type" value={item.request_type} />
					<input type="hidden" name="request_id" value={item.request_id} />
					<label class="flex flex-col text-xs text-stone-600">
						Reason
						<input
							name="reason"
							required
							maxlength="500"
							class="mt-1 w-80 rounded-md border border-stone-300 px-2 py-1 text-sm"
						/>
					</label>
					<button
						name="decision"
						value="approved"
						class="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
					>
						Approve
					</button>
					<button
						name="decision"
						value="rejected"
						class="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100"
					>
						Reject
					</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
