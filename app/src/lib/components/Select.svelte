<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		options,
		value = $bindable(''),
		placeholder,
		class: extra = '',
		...rest
	}: {
		options: { value: string; label: string }[];
		value?: string;
		placeholder?: string;
		class?: string;
	} & HTMLSelectAttributes = $props();
</script>

<div class="relative {extra}">
	<select
		bind:value
		class="h-10 w-full appearance-none rounded-md border border-border bg-surface pr-9 pl-3 text-base text-ink transition-colors duration-120 hover:border-border-strong disabled:cursor-not-allowed"
		{...rest}
	>
		{#if placeholder}<option value="">{placeholder}</option>{/if}
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<ChevronDown
		size={20}
		strokeWidth={1.5}
		class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted"
	/>
</div>
