<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let isRefreshing = $derived(page.status === 503);
</script>

<svelte:head>
	<title>TrustScore Atlas: {isRefreshing ? 'Data refresh' : 'Not found'}</title>
</svelte:head>

<div class="py-12 text-center">
	<h1 class="text-2xl font-semibold text-stone-900">
		{isRefreshing ? 'Data is being refreshed' : 'Business not found'}
	</h1>
	<p class="mt-2 text-stone-600">{page.error?.message ?? 'That atlas_id does not exist.'}</p>
	{#if !isRefreshing}
		<p class="mt-4">
			<a href={resolve('/search')} class="text-stone-600 underline hover:text-stone-900"
				>Try a search instead</a
			>
		</p>
	{/if}
</div>
