<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Combobox from './Combobox.svelte';
	import Chip from './Chip.svelte';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

	/**
	 * The filters, and what they are doing right now. Applied filters read back as chips a person
	 * can dismiss one at a time, with one Clear all that returns to the unfiltered page: the URL
	 * carries the state, so the back button restores the previous set and a link carries it to
	 * someone else.
	 *
	 * Empty controls are disabled on submit, which keeps the address bar showing only what was
	 * actually chosen.
	 */
	export interface FilterField {
		name: string;
		label: string;
		options: { value: string; count?: number; label?: string }[];
	}

	let {
		fields,
		values,
		hidden = [],
		submitLabel = 'Apply filters',
		clearHref
	}: {
		fields: FilterField[];
		values: Record<string, string>;
		hidden?: { name: string; value: string }[];
		submitLabel?: string;
		clearHref: string;
	} = $props();

	const applied = $derived(
		fields
			.map((field) => ({ field, value: values[field.name]?.trim() ?? '' }))
			.filter((entry) => entry.value !== '')
	);

	function dropEmptyControls(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		for (const control of form.elements) {
			const field = control as HTMLInputElement | HTMLSelectElement;
			if (field.name && field.value === '') field.disabled = true;
		}
	}

	/** The same page with one filter gone, so a chip is a link a person can middle-click. */
	function without(name: string): string {
		const pairs: [string, string][] = [];
		for (const item of hidden) if (item.value) pairs.push([item.name, item.value]);
		for (const entry of applied) {
			if (entry.field.name !== name) pairs.push([entry.field.name, entry.value]);
		}
		const query = pairs
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
		return query ? `${clearHref}?${query}` : clearHref;
	}
</script>

<form method="get" onsubmit={dropEmptyControls} class="flex flex-col gap-3">
	{#each hidden as item (item.name)}
		{#if item.value}<input type="hidden" name={item.name} value={item.value} />{/if}
	{/each}

	<div class="flex flex-wrap items-end gap-3 rounded-md border border-border bg-panel p-3">
		<span class="flex items-center gap-2 text-xs font-medium text-ink-muted">
			<SlidersHorizontal size={20} strokeWidth={1.5} aria-hidden="true" />
			Refine
		</span>
		{#each fields as field (field.name)}
			<div class="flex min-w-48 flex-col gap-1">
				<label class="text-xs text-ink-muted" for={`filter-${field.name}`}>{field.label}</label>
				<Combobox
					id={`filter-${field.name}`}
					name={field.name}
					options={field.options}
					value={values[field.name] ?? ''}
					placeholder="Any"
				/>
			</div>
		{/each}
		<button
			type="submit"
			class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
		>
			{submitLabel}
		</button>
	</div>
</form>

{#if applied.length > 0}
	<div class="flex flex-wrap items-center gap-2">
		{#each applied as entry (entry.field.name)}
			<a href={without(entry.field.name)} class="rounded-md">
				<Chip
					label={entry.field.label}
					value={entry.field.options.find((option) => option.value === entry.value)?.label ??
						entry.value}
				/>
			</a>
		{/each}
		<a
			href={clearHref}
			class="text-xs text-ink-muted underline transition-colors duration-120 hover:text-ink"
		>
			Clear all
		</a>
	</div>
{/if}
