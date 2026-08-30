<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	const isRefreshing = $derived(page.status === 503);
</script>

<svelte:head>
	<title>TrustScore Atlas: {isRefreshing ? 'Data refresh' : 'Not found'}</title>
</svelte:head>

<div class="flex max-w-reading flex-col gap-4">
	{#if isRefreshing}
		<Callout tone="info" title="The data is being refreshed">
			A regeneration is swapping the serving tables. This takes a minute or two, and the record will
			be here when it finishes.
		</Callout>
	{:else}
		<EmptyState
			title="No business carries that identifier"
			body={page.error?.message ??
				'An atlas_id is stable for the life of a business, but a mistyped one matches nothing. Search by name instead.'}
			examples={[
				{ label: 'Search by name', href: resolve('/search') },
				{ label: 'Browse by district', href: resolve('/explore') }
			]}
		/>
	{/if}
</div>
