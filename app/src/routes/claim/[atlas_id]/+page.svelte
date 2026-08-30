<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { resolve } from '$app/paths';
	import { CLAIM_VERIFICATION_STEPS } from '$lib/claims';
	import { formatWhen } from '$lib/format';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const record = $derived(data.confirmation?.record);
	const requested = $derived(formatWhen(record?.requested_at ?? null));
</script>

<svelte:head>
	<title>TrustScore Atlas: Request a claim</title>
</svelte:head>

<div class="flex max-w-reading flex-col gap-6">
	{#if data.confirmation}
		<PageHeader
			title="Claim request confirmation"
			lede="Check that this is the record you meant before confirming. A confirmed request is not a verified claim: verification happens afterwards, through one of the routes below."
		/>

		{#if data.confirmation.state === 'invalid' || !record}
			<EmptyState
				title="This confirmation link is not valid"
				body="A claim link works once and expires after 24 hours. Start again from the business record, and the page will issue a new one."
				examples={[{ label: 'Search for the business', href: resolve('/search') }]}
			/>
		{:else}
			{#if data.confirmation.state === 'unconfirmed'}
				<Callout tone="info" title="Not confirmed yet">
					Confirming records the request against this exact record.
				</Callout>
			{:else if data.confirmation.state === 'expired'}
				<Callout tone="warning" title="This request has expired">
					Claim links last 24 hours. Start again from the business record for a new one.
				</Callout>
			{:else if data.confirmation.state === 'confirmed'}
				<Callout tone="success" title="Already confirmed">
					This request is recorded and waiting for verification.
				</Callout>
			{/if}

			<dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-base">
				<dt class="text-xs text-ink-muted">Business</dt>
				<dd class="text-ink">{record.canonical_name}</dd>
				<dt class="text-xs text-ink-muted">atlas_id</dt>
				<dd class="font-mono text-2xs text-ink">{record.atlas_id}</dd>
				<dt class="text-xs text-ink-muted">Claimed role</dt>
				<dd class="text-ink">{record.claimant_role}</dd>
				<dt class="text-xs text-ink-muted">Requested</dt>
				<dd class="tnum text-ink" title={record.requested_at}>{requested?.text}</dd>
			</dl>

			{#if data.confirmation.state === 'unconfirmed'}
				<form
					method="post"
					action={resolve('/api/v1/claims/[claim_id]/confirm', { claim_id: record.claim_id })}
				>
					<input type="hidden" name="token" value={data.confirmation.token} />
					<button
						type="submit"
						class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
					>
						Confirm this request
					</button>
				</form>
			{/if}
		{/if}
	{:else if data.business}
		<PageHeader
			title="Claim this business"
			lede="This records a claim request for the business below. It does not make the claim true: a maintainer verifies it first, through one of the routes at the bottom of this page."
			meta={[data.business.canonical_name, data.business.atlas_id]}
		/>

		{#if data.confirmationComplete}
			<Callout tone="success" title="Request recorded">
				It is confirmed and waiting for verification.
			</Callout>
		{/if}

		<!--
			This form is also a tool the browser offers an agent, which is why its toolname and
			toolparamdescription attributes stay exactly as they are.
		-->
		<form
			method="post"
			action={resolve('/api/v1/claims')}
			class="flex flex-col gap-4"
			toolname="claim_business_form"
			tooldescription="Record a confirmed claim request for the business on this page. Submitting this form asserts the claimant's role; verification happens afterwards through the listed routes."
		>
			<input
				type="hidden"
				name="atlas_id"
				value={data.business.atlas_id}
				toolparamdescription="Opaque atlas_id of the business on this page."
			/>
			<label class="flex max-w-sm flex-col gap-1">
				<span class="text-xs font-medium text-ink-muted">Your role</span>
				<select
					name="claimant_role"
					required
					toolparamdescription="The claimant's relation to the business: owner or director, authorised employee, or authorised representative."
					class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
				>
					<option value="">Choose a role</option>
					<option value="owner or director">Owner or director</option>
					<option value="authorised employee">Authorised employee</option>
					<option value="authorised representative">Authorised representative</option>
				</select>
			</label>
			<button
				type="submit"
				class="h-10 w-fit rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
			>
				Record this claim request
			</button>
		</form>

		<section class="flex flex-col gap-3">
			<h2 class="flex items-center gap-2 text-xl font-semibold text-ink">
				<ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" />
				How a claim gets verified
			</h2>
			<ol class="flex flex-col gap-2">
				{#each CLAIM_VERIFICATION_STEPS as step, index (step)}
					<li class="flex gap-3 rounded-md border border-border bg-surface p-3">
						<span class="tnum text-xs text-ink-muted">{index + 1}</span>
						<span class="text-base text-ink">{step}</span>
					</li>
				{/each}
			</ol>
			<p class="text-xs text-ink-muted">
				A verified claim never overwrites a register. It lets you file corrections that a maintainer
				reviews, and an approved correction appears at the next regeneration beside the register
				value it disagrees with.
			</p>
		</section>
	{/if}
</div>
