<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>TrustScore Atlas: Confirm correction</title></svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Correction request confirmation</h1>

{#if data.confirmation.state === 'invalid' || !data.confirmation.record}
	<p class="mt-3 text-stone-700">This confirmation link is invalid.</p>
{:else}
	{#if data.confirmation.state === 'unconfirmed'}
		<p class="mt-3 text-stone-700">Review this exact record before confirming the request.</p>
	{:else if data.confirmation.state === 'expired'}
		<p class="mt-3 font-medium text-amber-800">This correction request has expired.</p>
	{:else if data.confirmation.state === 'confirmed'}
		<p class="mt-3 font-medium text-emerald-800">This correction request is confirmed.</p>
	{:else if data.confirmation.state === 'rejected'}
		<p class="mt-3 font-medium text-red-800">This correction request was rejected.</p>
	{/if}

	<dl class="mt-6 grid max-w-2xl grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-stone-700">
		<dt class="font-medium text-stone-900">Correction ID</dt>
		<dd class="break-all">{data.confirmation.record.correction_id}</dd>
		<dt class="font-medium text-stone-900">atlas_id</dt>
		<dd class="break-all">{data.confirmation.record.atlas_id}</dd>
		<dt class="font-medium text-stone-900">Field</dt>
		<dd>{data.confirmation.record.field}</dd>
		<dt class="font-medium text-stone-900">Proposed value</dt>
		<dd class="break-words whitespace-pre-wrap">{data.confirmation.record.value}</dd>
		<dt class="font-medium text-stone-900">Evidence URL</dt>
		<dd class="break-all">
			<a
				href={data.confirmation.record.evidence_url}
				class="text-blue-700 underline hover:text-blue-900"
				target="_blank"
				rel="external noreferrer">{data.confirmation.record.evidence_url}</a
			>
		</dd>
		<dt class="font-medium text-stone-900">Requested time</dt>
		<dd>{data.confirmation.record.requested_at}</dd>
		<dt class="font-medium text-stone-900">Expires</dt>
		<dd>{data.confirmation.record.expires_at}</dd>
	</dl>

	<p class="mt-4 max-w-2xl text-sm text-stone-600">
		Confirming stores this request for review. It does not change the published record.
	</p>

	{#if data.confirmation.state === 'unconfirmed'}
		<form
			method="post"
			action={resolve('/api/v1/corrections/[correction_id]/confirm', {
				correction_id: data.confirmation.record.correction_id
			})}
			class="mt-6"
		>
			<input type="hidden" name="token" value={data.confirmation.token} />
			<button
				type="submit"
				class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
			>
				Confirm correction request
			</button>
		</form>
	{/if}
{/if}
