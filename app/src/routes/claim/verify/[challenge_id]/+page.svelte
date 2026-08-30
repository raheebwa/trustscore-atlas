<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// The action's answer replaces the loaded state, so a spent link never offers itself again.
	const linkState = $derived(form?.state ?? data.state);
	const domain = $derived(form?.domain ?? data.domain);
	let confirming = $state(false);
</script>

<svelte:head>
	<title>TrustScore Atlas: Confirm a claim</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex max-w-reading flex-col gap-6">
	{#if linkState === 'invalid'}
		<PageHeader title="This link is not valid" />
		<EmptyState
			title="Nothing to confirm here"
			body="A confirmation link works once and lasts 30 minutes. A new one is asked for the same way this one was, from the claim it belongs to."
			examples={[{ label: 'Search for the business', href: resolve('/search') }]}
		/>
	{:else}
		<PageHeader
			title="Confirm this claim"
			lede="Someone claimed the business below and asked to confirm it from an address at {domain}. Confirming records that the claim reached a mailbox at that domain."
			meta={data.record ? [data.record.canonical_name, data.record.atlas_id] : undefined}
		/>

		{#if linkState === 'verified'}
			<Callout tone="success" title="Confirmed">
				The claim is recorded as reaching {domain}. That proves control of the domain, not that the
				business belongs to the claimant, so a maintainer reviews the claim before anything about
				the record changes. You can close this page.
			</Callout>
		{:else if linkState === 'used'}
			<Callout tone="info" title="This link was already used">
				Nothing further is needed. If you did not confirm it yourself, write to the maintainers from
				the methodology page.
			</Callout>
		{:else if linkState === 'expired'}
			<Callout tone="warning" title="This link has expired">
				Confirmation links last 30 minutes and this one has passed. A new one is asked for the same
				way this one was, from the claim it belongs to; the claim itself is untouched.
			</Callout>
		{:else}
			<Callout tone="info" title="Nothing happens until you press confirm">
				Opening this link changed nothing. If you were not expecting it, close this page and the
				link expires on its own.
			</Callout>
			<form method="post" onsubmit={() => (confirming = true)}>
				<input type="hidden" name="token" value={data.token} />
				<button
					type="submit"
					disabled={confirming}
					class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
				>
					{confirming ? 'Confirming' : 'Confirm this claim'}
				</button>
			</form>
		{/if}
	{/if}
</div>
