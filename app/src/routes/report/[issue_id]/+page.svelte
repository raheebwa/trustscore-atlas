<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import { formatWhen } from '$lib/format';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>TrustScore Atlas: Confirm issue report</title></svelte:head>

<PageHeader
	title="Confirm this report"
	lede="Reports are reviewed by a maintainer. Confirming records yours; it never changes a published value on its own."
/>

<div class="flex max-w-reading flex-col gap-6">
	{#if data.confirmation.state === 'invalid' || !data.confirmation.record}
		<EmptyState
			title="This confirmation link is not valid"
			body="A confirmation link works once and expires. Start again from the record and the page will issue a new one."
			examples={[{ label: 'Search for a business', href: resolve('/search') }]}
		/>
	{:else}
		{#if data.confirmation.state === 'unconfirmed'}
			<Callout tone="info" title="Not confirmed yet"
				>Check that this is what you meant to send. Confirming stores it for review; it does not
				change a published record.</Callout
			>
		{:else if data.confirmation.state === 'expired'}
			<Callout tone="warning" title="This issue report has expired."
				>Start again from the record for a fresh link.</Callout
			>
		{:else if data.confirmation.state === 'confirmed'}
			<Callout tone="success" title="This issue report is confirmed."
				>A maintainer reviews it before anything changes.</Callout
			>
		{:else if data.confirmation.state === 'rejected'}
			<Callout tone="error" title="This issue report was rejected."
				>Nothing was recorded against the business.</Callout
			>
		{/if}

		<dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-base">
			<dt class="text-xs text-ink-muted">Issue ID</dt>
			<dd class="font-mono text-2xs break-all text-ink">{data.confirmation.record.issue_id}</dd>
			<dt class="text-xs text-ink-muted">atlas_id</dt>
			<dd class="font-mono text-2xs break-all text-ink">
				{data.confirmation.record.atlas_id ?? 'Not supplied'}
			</dd>
			<dt class="text-xs text-ink-muted">Source</dt>
			<dd class="font-mono text-2xs break-all text-ink">
				{data.confirmation.record.source ?? 'Not supplied'}
			</dd>
			<dt class="text-xs text-ink-muted">Description</dt>
			<dd class="break-words whitespace-pre-wrap text-ink">
				{data.confirmation.record.description}
			</dd>
			<dt class="text-xs text-ink-muted">Requested time</dt>
			<dd class="tnum text-ink" title={data.confirmation.record.requested_at}>
				{formatWhen(data.confirmation.record.requested_at)?.text}
			</dd>
			<dt class="text-xs text-ink-muted">Expires</dt>
			<dd class="tnum text-ink" title={data.confirmation.record.expires_at}>
				{formatWhen(data.confirmation.record.expires_at)?.text}
			</dd>
		</dl>

		<p class="max-w-prose text-xs text-ink-muted">
			Confirming stores this report for review. It does not change the published record.
		</p>

		{#if data.confirmation.state === 'unconfirmed'}
			<form
				method="post"
				action={resolve('/api/v1/issues/[issue_id]/confirm', {
					issue_id: data.confirmation.record.issue_id
				})}
				class="mt-2"
			>
				<input type="hidden" name="token" value={data.confirmation.token} />
				<button
					type="submit"
					class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
				>
					Confirm issue report
				</button>
			</form>
		{/if}
	{/if}
</div>
