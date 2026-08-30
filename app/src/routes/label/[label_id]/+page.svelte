<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>TrustScore Atlas: Confirm linkage label</title></svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Linkage label confirmation</h1>

{#if data.confirmation.state === 'invalid' || !data.confirmation.record}
	<p class="mt-3 text-stone-700">This confirmation link is invalid.</p>
{:else}
	{#if data.confirmation.state === 'unconfirmed'}
		<p class="mt-3 text-stone-700">Review this exact record before confirming the request.</p>
	{:else if data.confirmation.state === 'expired'}
		<p class="mt-3 font-medium text-amber-800">This linkage label has expired.</p>
	{:else if data.confirmation.state === 'confirmed'}
		<p class="mt-3 font-medium text-emerald-800">This linkage label is confirmed.</p>
	{:else if data.confirmation.state === 'rejected'}
		<p class="mt-3 font-medium text-red-800">This linkage label was rejected.</p>
	{/if}

	<dl class="mt-6 grid max-w-2xl grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-stone-700">
		<dt class="font-medium text-stone-900">Label ID</dt>
		<dd class="break-all">{data.confirmation.record.label_id}</dd>
		<dt class="font-medium text-stone-900">atlas_id</dt>
		<dd class="break-all">{data.confirmation.record.atlas_id}</dd>
		<dt class="font-medium text-stone-900">Candidate atlas_id</dt>
		<dd class="break-all">{data.confirmation.record.candidate_atlas_id}</dd>
		<dt class="font-medium text-stone-900">Verdict</dt>
		<dd>{data.confirmation.record.verdict}</dd>
		<dt class="font-medium text-stone-900">Requested time</dt>
		<dd>{data.confirmation.record.requested_at}</dd>
		<dt class="font-medium text-stone-900">Expires</dt>
		<dd>{data.confirmation.record.expires_at}</dd>
	</dl>

	<p class="mt-4 max-w-2xl text-sm text-stone-600">
		Confirming stores this label for review. It does not merge or separate records.
	</p>

	{#if data.confirmation.state === 'unconfirmed'}
		<form
			method="post"
			action={resolve('/api/v1/linkage-labels/[label_id]/confirm', {
				label_id: data.confirmation.record.label_id
			})}
			class="mt-6"
		>
			<input type="hidden" name="token" value={data.confirmation.token} />
			<button
				type="submit"
				class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
			>
				Confirm linkage label
			</button>
		</form>
	{/if}
{/if}
