<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import { CLAIM_VERIFICATION_STEPS } from '$lib/claims';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Request a claim</title>
</svelte:head>

{#if data.confirmation}
	<h1 class="text-2xl font-semibold text-stone-900">Claim request confirmation</h1>

	{#if data.confirmation.state === 'invalid' || !data.confirmation.record}
		<p class="mt-3 text-stone-700">This confirmation link is invalid.</p>
	{:else}
		{#if data.confirmation.state === 'unconfirmed'}
			<p class="mt-3 text-stone-700">Review this exact record before confirming the request.</p>
		{:else if data.confirmation.state === 'expired'}
			<p class="mt-3 font-medium text-amber-800">This claim request has expired.</p>
		{:else if data.confirmation.state === 'confirmed'}
			<p class="mt-3 font-medium text-emerald-800">This claim request is already confirmed.</p>
		{:else}
			<p class="mt-3 text-stone-700">This confirmation link is invalid.</p>
		{/if}

		<dl class="mt-6 grid max-w-xl grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-stone-700">
			<dt class="font-medium text-stone-900">atlas_id</dt>
			<dd>{data.confirmation.record.atlas_id}</dd>
			<dt class="font-medium text-stone-900">Canonical name</dt>
			<dd>{data.confirmation.record.canonical_name}</dd>
			<dt class="font-medium text-stone-900">Claimant role</dt>
			<dd>{data.confirmation.record.claimant_role}</dd>
			<dt class="font-medium text-stone-900">Requested time</dt>
			<dd>{data.confirmation.record.requested_at}</dd>
		</dl>

		{#if data.confirmation.state === 'unconfirmed'}
			<form
				method="post"
				action={resolve('/api/v1/claims/[claim_id]/confirm', {
					claim_id: data.confirmation.record.claim_id
				})}
				class="mt-6"
			>
				<input type="hidden" name="token" value={data.confirmation.token} />
				<button
					type="submit"
					class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
				>
					Confirm
				</button>
			</form>
		{/if}
	{/if}
{:else if data.business}
	<h1 class="text-2xl font-semibold text-stone-900">Request a business claim</h1>
	<p class="mt-2 text-stone-700">
		This records a confirmed claim request for <strong>{data.business.canonical_name}</strong>. It
		does not create a verified claim.
	</p>
	<p class="mt-1 text-sm text-stone-500">atlas_id: {data.business.atlas_id}</p>

	{#if data.confirmationComplete}
		<p class="mt-4 rounded-md bg-emerald-50 px-4 py-3 font-medium text-emerald-900">
			The claim request is confirmed and ready for verification.
		</p>
	{/if}

	<form
		method="post"
		action={resolve('/api/v1/claims')}
		class="mt-6 max-w-xl space-y-4"
		toolname="claim_business_form"
		tooldescription="Record a confirmed claim request for the business on this page. Submitting this form asserts the claimant's role; verification happens afterwards through the listed routes."
	>
		<input
			type="hidden"
			name="atlas_id"
			value={data.business.atlas_id}
			toolparamdescription="Opaque atlas_id of the business on this page."
		/>
		<label class="block">
			<span class="block text-sm font-medium text-stone-700">Your role</span>
			<select
				name="claimant_role"
				required
				toolparamdescription="The claimant's relation to the business: owner or director, authorised employee, or authorised representative."
				class="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
			>
				<option value="">Choose a role</option>
				<option value="owner or director">Owner or director</option>
				<option value="authorised employee">Authorised employee</option>
				<option value="authorised representative">Authorised representative</option>
			</select>
		</label>
		<button
			type="submit"
			class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
		>
			Record confirmed claim request
		</button>
	</form>

	<section class="mt-8">
		<h2 class="text-lg font-semibold text-stone-900">Verification routes</h2>
		<ol class="mt-2 list-decimal space-y-2 pl-5 text-stone-700">
			{#each CLAIM_VERIFICATION_STEPS as step (step)}
				<li>{step}</li>
			{/each}
		</ol>
	</section>
{/if}
