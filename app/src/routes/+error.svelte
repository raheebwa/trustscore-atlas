<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	/**
	 * Any error the shell itself has to answer: a route that does not exist, and the minute or two
	 * during which the serving tables are being swapped. A page that says only "404 Not Found" tells
	 * a reader nothing about where they are or what to do next, which on a site of eighty thousand
	 * records is the moment they leave.
	 */
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	const isRefreshing = $derived(page.status === 503);
	const title = $derived(isRefreshing ? 'Data refresh' : 'Not found');
</script>

<svelte:head>
	<title>TrustScore Atlas: {title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex max-w-reading flex-col gap-4">
	{#if isRefreshing}
		<Callout tone="info" title="The data is being refreshed">
			The serving tables are being swapped. This takes a minute or two, and the page will be here
			when it finishes.
		</Callout>
	{:else}
		<EmptyState
			title="There is no page at this address"
			body={page.status === 404
				? 'The address may be mistyped, or the page may have moved. Search for a business by name, or start again from the front page.'
				: (page.error?.message ?? 'Something went wrong on our side. Try again in a moment.')}
			examples={[
				{ label: 'Search for a business', href: resolve('/search') },
				{ label: 'Go to the front page', href: resolve('/') }
			]}
		/>
	{/if}
</div>
