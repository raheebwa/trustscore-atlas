<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	/**
	 * The control that scopes the whole site. It appears once at a time: inline in the header where
	 * there is room, and inside the menu on a phone, where three rows of chrome before the first
	 * record is most of the screen.
	 */
	import { page } from '$app/state';
	import type { Pack } from '$lib/server/packs';

	let { packs, country }: { packs: Pack[]; country: string } = $props();

	// Every other query parameter travels with the switch so a scoped page keeps its filters.
	const carried = $derived(
		[...page.url.searchParams.entries()].filter(([key]) => key !== 'country' && key !== 'cursor')
	);
</script>

<form method="get" class="flex shrink-0 items-center gap-2">
	{#each carried as [key, value], index (`${key}-${index}`)}
		<input type="hidden" name={key} {value} />
	{/each}
	<label class="sr-only" for="country-switch">Country pack</label>
	<select
		id="country-switch"
		name="country"
		class="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
		value={country}
		onchange={(event) => event.currentTarget.form?.requestSubmit()}
	>
		{#each packs as pack (pack.code)}
			<option value={pack.code}>{pack.code} · {pack.name}</option>
		{/each}
	</select>
	<noscript><button type="submit" class="text-xs underline">Switch</button></noscript>
</form>
