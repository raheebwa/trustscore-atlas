<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	/**
	 * A number that means something on its own, with the sentence that makes it mean something.
	 * The label comes first because a reader scanning a page needs to know what they are about to
	 * read; the caption is not optional, since a bare number invites a wrong reading.
	 */
	let {
		label,
		value,
		unit,
		caption,
		emphasis = 'peer'
	}: {
		label: string;
		value: string | number;
		unit?: string;
		caption: string;
		emphasis?: 'lead' | 'peer';
	} = $props();

	const text = $derived(typeof value === 'number' ? value.toLocaleString() : value);
</script>

<div class="flex min-w-0 flex-col gap-1">
	<p class="text-xs font-medium text-ink-muted">{label}</p>
	<p class="flex w-fit items-baseline gap-1 pb-1 underrule">
		<span class="font-display tnum {emphasis === 'lead' ? 'text-4xl' : 'text-3xl'} text-ink">
			{text}
		</span>
		{#if unit}<span class="text-xs text-ink-muted">{unit}</span>{/if}
	</p>
	<p class="max-w-[30ch] text-xs text-ink-muted">{caption}</p>
</div>
