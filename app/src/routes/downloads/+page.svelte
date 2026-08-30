<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
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
</script>

<svelte:head>
	<title>TrustScore Atlas: Downloads</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Downloads</h1>
<p class="mt-2 max-w-3xl text-stone-600">
	The whole atlas as files: the canonical layer as Parquet with CSV twins, and every register's
	typed records and statements as pulled. Each bundle is a Frictionless data package with a
	datapackage.json, a LICENSE and a SOURCES.md of attribution lines, refreshed with each
	regeneration.
</p>

{#if !downloads}
	<p class="mt-6 text-stone-500">No bundle has been published yet.</p>
{:else}
	<p class="mt-4 text-sm text-stone-500">
		Regeneration {downloads.regeneration_id}{#if downloads.created}, built {downloads.created}{/if}
		&middot; {size(downloads.total_bytes)} in total &middot; canonical layer
		{downloads.licenses[0]?.name ?? 'see LICENSE'}; per-source files keep their publisher's terms
		&middot;
		{#each downloads.extras as extra, index (extra.path)}
			<a href={extra.href} class="underline">{extra.path}</a>{index < downloads.extras.length - 1
				? ', '
				: ''}
		{/each}
	</p>

	<h2 class="mt-6 text-lg font-semibold text-stone-900">Canonical layer</h2>
	<div class="mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-white">
		<table class="w-full min-w-[40rem] text-left text-sm">
			<thead class="border-b border-stone-200 text-stone-500">
				<tr>
					<th class="px-4 py-2 font-medium">File</th>
					<th class="px-4 py-2 font-medium">Format</th>
					<th class="px-4 py-2 font-medium">Size</th>
					<th class="px-4 py-2 font-medium">Licence</th>
					<th class="px-4 py-2 font-medium">About</th>
				</tr>
			</thead>
			<tbody>
				{#each downloads.canonical as item (item.path)}
					<tr class="border-b border-stone-100 last:border-0">
						<td class="px-4 py-2"
							><a href={item.href} class="text-stone-900 underline">{item.path}</a></td
						>
						<td class="px-4 py-2 text-stone-600">{item.format ?? ''}</td>
						<td class="px-4 py-2 text-stone-600">{size(item.bytes)}</td>
						<td class="px-4 py-2 text-stone-600">{item.licence}</td>
						<td class="px-4 py-2 text-stone-600">{item.description ?? ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h2 class="mt-6 text-lg font-semibold text-stone-900">Per source</h2>
	<div class="mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-white">
		<table class="w-full min-w-[40rem] text-left text-sm">
			<thead class="border-b border-stone-200 text-stone-500">
				<tr>
					<th class="px-4 py-2 font-medium">File</th>
					<th class="px-4 py-2 font-medium">Size</th>
					<th class="px-4 py-2 font-medium">Licence</th>
				</tr>
			</thead>
			<tbody>
				{#each downloads.sources as item (item.path)}
					<tr class="border-b border-stone-100 last:border-0">
						<td class="px-4 py-2"
							><a href={item.href} class="text-stone-900 underline">{item.path}</a></td
						>
						<td class="px-4 py-2 text-stone-600">{size(item.bytes)}</td>
						<td class="px-4 py-2 text-stone-600">{item.licence}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
