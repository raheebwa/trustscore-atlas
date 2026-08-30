<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';
	import AppHeader from './AppHeader.svelte';
	import AppFooter from './AppFooter.svelte';
	import type { Pack } from '$lib/server/packs';

	let {
		packs = [],
		country,
		regeneration,
		width = 'data',
		children
	}: {
		packs?: Pack[];
		country: string;
		regeneration?: string;
		width?: 'data' | 'reading';
		children: Snippet;
	} = $props();
</script>

<div class="flex min-h-screen flex-col bg-canvas text-ink">
	<AppHeader {packs} {country} />
	<main
		class="mx-auto w-full flex-1 px-4 py-8 {width === 'reading' ? 'max-w-reading' : 'max-w-data'}"
	>
		{@render children()}
	</main>
	<AppFooter {regeneration} />
</div>
