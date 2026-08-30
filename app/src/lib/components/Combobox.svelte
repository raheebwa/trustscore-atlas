<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { Combobox } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

	/**
	 * A filter control that offers only values the data actually holds, with the number of
	 * businesses behind each one. Typing filters the list; the count is what tells a person
	 * whether a filter is worth applying before they apply it.
	 */
	let {
		id,
		name,
		options,
		value = $bindable(''),
		placeholder = 'Any',
		describedBy,
		onValueChange
	}: {
		id: string;
		name?: string;
		options: { value: string; count?: number; label?: string }[];
		value?: string;
		placeholder?: string;
		describedBy?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	let search = $state('');
	const filtered = $derived(
		search.trim() === ''
			? options
			: options.filter((option) =>
					`${option.label ?? ''} ${option.value}`
						.toLowerCase()
						.includes(search.trim().toLowerCase())
				)
	);
	// The reading of the chosen value, which is the label when the caller gave one: registers
	// publish KAMPALA and the filter is keyed on that, but nobody reads in capitals.
	const label = $derived(
		options.find((option) => option.value === value)?.label || value || placeholder
	);
</script>

<Combobox.Root
	type="single"
	{name}
	bind:value
	onValueChange={(next) => onValueChange?.(next)}
	onOpenChangeComplete={(open) => {
		if (!open) search = '';
	}}
>
	<div class="relative">
		<Combobox.Input
			{id}
			aria-describedby={describedBy}
			defaultValue={value}
			oninput={(event) => (search = event.currentTarget.value)}
			placeholder={label}
			class="h-10 w-full rounded-md border border-border bg-surface pr-9 pl-3 text-base text-ink transition-colors duration-120 placeholder:text-ink-muted hover:border-border-strong"
		/>
		<Combobox.Trigger
			class="absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted transition-colors duration-120 hover:text-ink"
			aria-label="Show the values in the data"
		>
			<ChevronsUpDown size={20} strokeWidth={1.5} />
		</Combobox.Trigger>
	</div>
	<Combobox.Portal>
		<Combobox.Content
			sideOffset={6}
			class="z-30 max-h-72 w-(--bits-combobox-anchor-width) overflow-y-auto rounded-md border border-border-strong bg-surface p-1 shadow-lg"
		>
			<Combobox.Viewport>
				<Combobox.Item
					value=""
					label={placeholder}
					class="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-base text-ink-muted data-highlighted:bg-panel"
				>
					{placeholder}
				</Combobox.Item>
				{#each filtered as option (option.value)}
					<Combobox.Item
						value={option.value}
						label={option.label ?? option.value}
						class="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-base text-ink data-highlighted:bg-panel data-selected:bg-accent-tint"
					>
						{#snippet children({ selected })}
							<span class="truncate">{option.label ?? option.value}</span>
							{#if option.count !== undefined}
								<span class="ml-auto tnum text-xs text-ink-muted"
									>{option.count.toLocaleString()}</span
								>
							{/if}
							{#if selected}
								<Check size={16} strokeWidth={1.5} class="shrink-0 text-accent-ink" />
							{/if}
						{/snippet}
					</Combobox.Item>
				{:else}
					<p class="px-2 py-3 text-sm text-ink-muted">
						No value in the data matches that. Clear the box to see all of them.
					</p>
				{/each}
			</Combobox.Viewport>
		</Combobox.Content>
	</Combobox.Portal>
</Combobox.Root>
