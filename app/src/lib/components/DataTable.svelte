<script lang="ts" generics="Row extends object">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import Skeleton from './Skeleton.svelte';
	import type { Column } from './table';

	/**
	 * One table vocabulary for the site. Below the medium breakpoint a table of six columns stops
	 * being a table: it collapses to a definition list per row, keeping the columns marked as
	 * primary, because a horizontally scrolling table on a phone hides exactly the column the
	 * reader came for.
	 */
	let {
		columns,
		rows,
		caption,
		loading = false,
		empty,
		cell,
		sort = $bindable<{ key: string; direction: 'asc' | 'desc' } | null>(null)
	}: {
		columns: Column[];
		rows: Row[];
		caption: string;
		loading?: boolean;
		empty?: Snippet;
		cell?: Snippet<[{ row: Row; column: Column }]>;
		sort?: { key: string; direction: 'asc' | 'desc' } | null;
	} = $props();

	// A row is the caller's own type, so reading a column out of it is one deliberate cast here
	// rather than an index signature forced onto every record shape in the app.
	const valueOf = (row: Row, key: string): unknown => (row as Record<string, unknown>)[key];

	const sorted = $derived.by(() => {
		if (!sort) return rows;
		const { key, direction } = sort;
		const factor = direction === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const left = valueOf(a, key);
			const right = valueOf(b, key);
			if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
			return String(left ?? '').localeCompare(String(right ?? '')) * factor;
		});
	});

	function toggleSort(column: Column) {
		if (!column.sortable) return;
		sort =
			sort?.key === column.key
				? { key: column.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
				: { key: column.key, direction: 'asc' };
	}

	function classesFor(column: Column): string {
		return [
			'px-3 py-2',
			column.align === 'end' ? 'text-right' : 'text-left',
			column.numeric ? 'tnum' : '',
			column.mono ? 'font-mono text-2xs' : ''
		]
			.filter(Boolean)
			.join(' ');
	}
</script>

<div class="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
	<table class="w-full border-collapse text-base">
		<caption class="sr-only">{caption}</caption>
		<thead class="border-b border-border-strong bg-panel text-xs text-ink-muted">
			<tr>
				{#each columns as column (column.key)}
					<th
						scope="col"
						class={classesFor(column)}
						aria-sort={sort?.key === column.key
							? sort.direction === 'asc'
								? 'ascending'
								: 'descending'
							: undefined}
					>
						{#if column.sortable}
							<button
								type="button"
								class="inline-flex items-center gap-1 transition-colors duration-120 hover:text-ink"
								onclick={() => toggleSort(column)}
							>
								{column.label}
								<ArrowUpDown size={14} strokeWidth={1.5} aria-hidden="true" />
							</button>
						{:else}
							{column.label}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#if loading}
				{#each Array.from({ length: 5 }), index (index)}
					<tr class="border-b border-border last:border-0">
						{#each columns as column (column.key)}
							<td class={classesFor(column)}><Skeleton variant="text" /></td>
						{/each}
					</tr>
				{/each}
			{:else}
				{#each sorted as row, index (index)}
					<tr class="border-b border-border last:border-0 hover:bg-panel">
						{#each columns as column (column.key)}
							<td class={classesFor(column)}>
								{#if cell}{@render cell({ row, column })}{:else}{String(
										valueOf(row, column.key) ?? ''
									)}{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
	{#if !loading && sorted.length === 0 && empty}
		<div class="p-4">{@render empty()}</div>
	{/if}
</div>

<!-- Below md the same rows read as a list, so the column that matters stays on screen. -->
<ul class="flex flex-col gap-3 md:hidden">
	{#if loading}
		{#each Array.from({ length: 3 }), index (index)}
			<li class="rounded-md border border-border bg-surface p-3"><Skeleton variant="row" /></li>
		{/each}
	{:else}
		{#each sorted as row, index (index)}
			<li class="rounded-md border border-border bg-surface p-3">
				<dl class="flex flex-col gap-1">
					{#each columns as column (column.key)}
						<div class="flex justify-between gap-3">
							<dt class="text-xs text-ink-muted">{column.label}</dt>
							<dd class="text-right text-base {column.numeric ? 'tnum' : ''}">
								{#if cell}{@render cell({ row, column })}{:else}{String(
										valueOf(row, column.key) ?? ''
									)}{/if}
							</dd>
						</div>
					{/each}
				</dl>
			</li>
		{/each}
	{/if}
</ul>

{#if !loading && sorted.length === 0 && empty}
	<div class="md:hidden">{@render empty()}</div>
{/if}
