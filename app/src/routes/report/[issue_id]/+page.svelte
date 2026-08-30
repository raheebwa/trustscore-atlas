<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>TrustScore Atlas: Confirm issue report</title></svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Issue report confirmation</h1>

{#if data.confirmation.state === 'invalid' || !data.confirmation.record}
	<p class="mt-3 text-stone-700">This confirmation link is invalid.</p>
{:else}
	{#if data.confirmation.state === 'unconfirmed'}
		<p class="mt-3 text-stone-700">Review this exact record before confirming the report.</p>
	{:else if data.confirmation.state === 'expired'}
		<p class="mt-3 font-medium text-amber-800">This issue report has expired.</p>
	{:else if data.confirmation.state === 'confirmed'}
		<p class="mt-3 font-medium text-emerald-800">This issue report is confirmed.</p>
	{:else if data.confirmation.state === 'rejected'}
		<p class="mt-3 font-medium text-red-800">This issue report was rejected.</p>
	{/if}

	<dl class="mt-6 grid max-w-2xl grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-stone-700">
		<dt class="font-medium text-stone-900">Issue ID</dt>
		<dd class="break-all">{data.confirmation.record.issue_id}</dd>
		<dt class="font-medium text-stone-900">atlas_id</dt>
		<dd class="break-all">{data.confirmation.record.atlas_id ?? 'Not supplied'}</dd>
		<dt class="font-medium text-stone-900">Source</dt>
		<dd class="break-all">{data.confirmation.record.source ?? 'Not supplied'}</dd>
		<dt class="font-medium text-stone-900">Description</dt>
		<dd class="break-words whitespace-pre-wrap">{data.confirmation.record.description}</dd>
		<dt class="font-medium text-stone-900">Requested time</dt>
		<dd>{data.confirmation.record.requested_at}</dd>
		<dt class="font-medium text-stone-900">Expires</dt>
		<dd>{data.confirmation.record.expires_at}</dd>
	</dl>

	<p class="mt-4 max-w-2xl text-sm text-stone-600">
		Confirming stores this report for review. It does not change the published record.
	</p>

	{#if data.confirmation.state === 'unconfirmed'}
		<form
			method="post"
			action={resolve('/api/v1/issues/[issue_id]/confirm', {
				issue_id: data.confirmation.record.issue_id
			})}
			class="mt-6"
		>
			<input type="hidden" name="token" value={data.confirmation.token} />
			<button
				type="submit"
				class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
			>
				Confirm issue report
			</button>
		</form>
	{/if}
{/if}
