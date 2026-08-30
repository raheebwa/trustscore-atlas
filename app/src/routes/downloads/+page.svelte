<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Download from '@lucide/svelte/icons/download';
	import Database from '@lucide/svelte/icons/database';
	import FileText from '@lucide/svelte/icons/file-text';
	import { formatWhen } from '$lib/format';
	import { widthOf } from '$lib/measures';
	import { describeRegister } from '$lib/registers';
	import Callout from '$lib/components/Callout.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import type { Column } from '$lib/components/table';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const downloads = $derived(data.downloads);

	function size(bytes: number | undefined): string {
		if (!bytes) return '';
		if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
		if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
		if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
		return `${bytes} B`;
	}

	const canonicalBytes = $derived(
		downloads?.canonical.reduce((total, item) => total + (item.bytes ?? 0), 0) ?? 0
	);
	const sourceBytes = $derived(
		downloads?.sources.reduce((total, item) => total + (item.bytes ?? 0), 0) ?? 0
	);
	const largest = $derived(
		Math.max(1, ...(downloads?.canonical ?? []).map((item) => item.bytes ?? 0))
	);
	const largestSource = $derived(
		Math.max(1, ...(downloads?.sources ?? []).map((item) => item.bytes ?? 0))
	);
	const built = $derived(formatWhen(downloads?.created ?? null));

	const columns: Column[] = [
		{ key: 'path', label: 'File', mono: true, primary: true },
		{ key: 'bytes', label: 'Size', numeric: true, align: 'end', primary: true },
		{ key: 'licence', label: 'Licence' },
		{ key: 'description', label: 'What it holds' }
	];
	const sourceColumns: Column[] = [
		{ key: 'path', label: 'File', mono: true, primary: true },
		{ key: 'register', label: 'Register' },
		{ key: 'bytes', label: 'Size', numeric: true, align: 'end', primary: true },
		{ key: 'licence', label: 'Licence' }
	];

	/** The register a per-source file belongs to, read from its path. */
	function registerOf(path: string): string {
		const parts = path.split('/');
		return parts.length > 1 ? parts[1].replace(/_/g, '.') : path;
	}
</script>

<svelte:head>
	<title>TrustScore Atlas: Downloads</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Take the whole atlas"
		lede="The canonical layer as Parquet with CSV twins, and every register's typed records and statements as they were pulled. Each bundle is a Frictionless data package with a datapackage.json, a LICENSE and a SOURCES.md of attribution lines, rebuilt with every regeneration."
	/>

	{#if !downloads}
		<Callout tone="info" title="No bundle published yet">
			The first regeneration to finish publishes one, and this page will name it.
		</Callout>
	{:else}
		<div class="flex flex-wrap items-start gap-10 rounded-md border border-border bg-surface p-6">
			<StatTile
				label="Bundle size"
				value={size(downloads.total_bytes)}
				caption="Everything below, in one regeneration's package."
				emphasis="lead"
			/>
			<div class="flex min-w-64 flex-col gap-2">
				<p class="text-xs font-medium text-ink-muted">Canonical against per-source</p>
				<div class="flex h-3 w-full overflow-hidden rounded-sm border border-border">
					<div
						class="h-full bg-score-earned"
						style={`width: ${widthOf((canonicalBytes / Math.max(1, canonicalBytes + sourceBytes)) * 100)}`}
					></div>
					<div class="h-full bg-score-unearned"></div>
				</div>
				<p class="text-xs text-ink-muted">
					<span class="tnum">{size(canonicalBytes)}</span> canonical,
					<span class="tnum">{size(sourceBytes)}</span> as pulled from the registers.
				</p>
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-xs font-medium text-ink-muted">This bundle</p>
				<p class="font-mono text-2xs text-ink">{downloads.regeneration_id}</p>
				{#if built}<p class="text-xs text-ink-muted">Built {built.text}</p>{/if}
				<p class="text-xs text-ink-muted">
					Canonical layer: {downloads.licenses[0]?.name ?? 'see LICENSE'}. Per-source files keep
					their publisher's terms.
				</p>
			</div>
		</div>

		<section class="flex flex-col gap-3">
			<h2 class="flex items-center gap-2 text-xl font-semibold text-ink">
				<Database size={20} strokeWidth={1.5} aria-hidden="true" />
				Canonical layer
			</h2>
			<DataTable
				{columns}
				rows={downloads.canonical}
				caption="Canonical files in this bundle with their sizes and licences"
			>
				{#snippet cell({ row, column })}
					{#if column.key === 'path'}
						<a href={row.href} class="inline-flex items-center gap-1 text-ink underline">
							<Download size={16} strokeWidth={1.5} aria-hidden="true" />
							{row.path}
						</a>
					{:else if column.key === 'bytes'}
						<span class="flex items-center justify-end gap-2">
							<span class="hidden h-2 w-16 rounded-xs bg-panel sm:block">
								<span
									class="block h-full rounded-xs bg-score-earned"
									style={`width: ${widthOf(((row.bytes ?? 0) / largest) * 100)}`}
								></span>
							</span>
							<span class="tnum">{size(row.bytes)}</span>
						</span>
					{:else if column.key === 'licence'}
						<span
							class="inline-flex rounded-md border border-border bg-panel px-2 py-0.5 text-2xs text-ink"
							>{row.licence}</span
						>
					{:else}
						<span class="text-ink-muted">{row.description ?? ''}</span>
					{/if}
				{/snippet}
			</DataTable>
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="flex items-center gap-2 text-xl font-semibold text-ink">
				<FileText size={20} strokeWidth={1.5} aria-hidden="true" />
				As pulled, per register
			</h2>
			<DataTable
				columns={sourceColumns}
				rows={downloads.sources.map((item) => ({ ...item, register: registerOf(item.path) }))}
				caption="Per-register files in this bundle with their sizes and licences"
			>
				{#snippet cell({ row, column })}
					{#if column.key === 'path'}
						<a href={row.href} class="inline-flex items-center gap-1 text-ink underline">
							<Download size={16} strokeWidth={1.5} aria-hidden="true" />
							{row.path}
						</a>
					{:else if column.key === 'register'}
						<span class="text-ink-muted">{describeRegister(String(row.register)).short}</span>
					{:else if column.key === 'bytes'}
						<span class="flex items-center justify-end gap-2">
							<span class="hidden h-2 w-16 rounded-xs bg-panel sm:block">
								<span
									class="block h-full rounded-xs bg-score-earned"
									style={`width: ${widthOf(((row.bytes ?? 0) / largestSource) * 100)}`}
								></span>
							</span>
							<span class="tnum">{size(row.bytes)}</span>
						</span>
					{:else}
						<span
							class="inline-flex rounded-md border border-border bg-panel px-2 py-0.5 text-2xs text-ink"
							>{row.licence}</span
						>
					{/if}
				{/snippet}
			</DataTable>
		</section>

		{#if downloads.extras.length > 0}
			<section class="flex flex-col gap-3">
				<h2 class="text-xl font-semibold text-ink">What describes the bundle</h2>
				<ul class="grid gap-3 md:grid-cols-3">
					{#each downloads.extras as extra (extra.path)}
						<li>
							<a
								href={extra.href}
								class="flex items-center gap-2 rounded-md border border-border bg-surface p-3 text-base text-ink transition-colors duration-120 hover:border-border-strong hover:bg-panel"
							>
								<FileText size={20} strokeWidth={1.5} aria-hidden="true" />
								{extra.path}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
