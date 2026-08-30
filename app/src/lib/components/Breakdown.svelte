<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import BarList from './BarList.svelte';

	/**
	 * One named breakdown of a segment. A heading with nothing under it reads as a fault in the
	 * page rather than as an empty count, so a breakdown with no rows renders nothing: the sentence
	 * about what carries no value belongs beside the map, where it can say how many.
	 */
	let {
		title,
		rows,
		unit,
		hrefFor
	}: {
		title: string;
		rows: { key: string; count: number }[];
		unit: string;
		hrefFor?: (key: string) => string;
	} = $props();
</script>

{#if rows.length > 0}
	<section class="flex flex-col gap-2">
		<h2 class="text-lg font-semibold text-ink">{title}</h2>
		<BarList {rows} {unit} {hrefFor} />
	</section>
{/if}
