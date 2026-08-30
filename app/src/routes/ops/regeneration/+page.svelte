<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Regeneration</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Regeneration</h1>
<p class="mt-1 text-sm text-stone-600">
	Signed in as {data.maintainer}. Live regeneration
	<span class="font-mono">{data.regenerations.live ?? 'none'}</span>. A request is appended here and
	the refresh workflow carries it out: regenerate pulls every due register, resolves, scores and
	loads; a rollback reloads an earlier regeneration's SQL from the bucket and re-points the
	downloads, so both are refused while another request is still running.
	<a href={resolve('/ops')} class="underline">Queue</a>
	<a href={resolve('/ops/linkage')} class="underline">Linkage review</a>
	<a href={resolve('/ops/sources')} class="underline">Sources</a>
</p>

{#if form?.message}
	<p class="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
		{form.message}
	</p>
{:else if form?.requested}
	<p
		class="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
	>
		Recorded {form.kind}{form.target ? ` to ${form.target}` : ''} as {form.requested}; the next
		workflow run picks it up.
	</p>
{/if}

<section class="mt-6 rounded-lg border border-stone-200 bg-white p-4">
	<h2 class="font-semibold text-stone-900">Regenerate now</h2>
	<form method="post" action="?/request" use:enhance class="mt-3 flex flex-wrap items-end gap-2">
		<input type="hidden" name="kind" value="regenerate" />
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
			class="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
		>
			Request regeneration
		</button>
	</form>
</section>

<section class="mt-6 rounded-lg border border-stone-200 bg-white p-4">
	<h2 class="font-semibold text-stone-900">Roll back</h2>
	{#if data.regenerations.targets.length === 0}
		<p class="mt-2 text-sm text-stone-500">No earlier regeneration is known to this database.</p>
	{:else}
		<form method="post" action="?/request" use:enhance class="mt-3 flex flex-wrap items-end gap-2">
			<input type="hidden" name="kind" value="rollback" />
			<label class="flex flex-col text-xs text-stone-600">
				Target regeneration
				<select name="target_id" class="mt-1 rounded-md border border-stone-300 px-2 py-1 text-sm">
					{#each data.regenerations.targets as target (target.id)}
						<option value={target.id}>{target.id} ({target.status}, {target.finished_at})</option>
					{/each}
				</select>
			</label>
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
				class="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-100"
			>
				Request rollback
			</button>
		</form>
		<p class="mt-2 text-xs text-stone-500">
			Accepted only when the target's load SQL and its bundle are both in the bucket; the last three
			regenerations are kept there.
		</p>
	{/if}
</section>

<section class="mt-6">
	<h2 class="font-semibold text-stone-900">Requests</h2>
	{#if data.requests.length === 0}
		<p class="mt-2 text-sm text-stone-500">No requests yet.</p>
	{:else}
		<ul class="mt-2 flex flex-col gap-2 text-sm">
			{#each data.requests as item (item.request_id)}
				<li class="rounded-md border border-stone-200 bg-white px-3 py-2">
					<span class="font-medium text-stone-900">{item.kind}</span>
					{#if item.target_id}<span class="font-mono text-xs">to {item.target_id}</span>{/if}
					<span class="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs">{item.status}</span>
					<p class="mt-1 text-stone-600">{item.reason}</p>
					<p class="text-xs text-stone-500">
						{item.requested_by}, {item.requested_at}; last update {item.updated_at}{item.note
							? `: ${item.note}`
							: ''}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
