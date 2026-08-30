<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AppHeader from './AppHeader.svelte';
	import AppFooter from './AppFooter.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import { breadcrumbJsonLd, buildCrumbs } from '$lib/breadcrumbs';
	import { formatFieldLabel } from '$lib/format';
	import type { Pack } from '$lib/server/packs';

	let {
		packs = [],
		country,
		countryName,
		regeneration,
		width = 'data',
		children
	}: {
		packs?: Pack[];
		country: string;
		countryName?: string;
		regeneration?: string;
		width?: 'data' | 'reading';
		children: Snippet;
	} = $props();

	// Everything the trail needs comes from the route and the page's own loaded data: a record's
	// name, a traced field, the query that was run. No page hands the shell a breadcrumb.
	const data = $derived(page.data as Record<string, unknown>);
	const record = $derived(
		data.record as { canonical_name?: string; atlas_id?: string } | undefined
	);
	const trace = $derived(data.trace as { field?: string } | undefined);
	// A page about one record says which country that record is in, and the switch follows it: a
	// record is addressed by its own id, so it cannot be filed under whatever was last chosen.
	const recordPack = $derived(
		packs.find((pack) => pack.code === (data.recordCountry as string | undefined))
	);
	const scopedCountry = $derived(recordPack?.code ?? country);
	const scopedCountryName = $derived(recordPack?.name ?? countryName ?? country);
	const crumbs = $derived(
		buildCrumbs({
			pathname: page.url.pathname,
			country: scopedCountry,
			countryName: scopedCountryName,
			recordId: record?.atlas_id ?? (page.params.atlas_id as string | undefined) ?? null,
			recordName:
				record?.canonical_name ??
				(data.canonicalName as string | undefined) ??
				(data.business as { canonical_name?: string } | undefined)?.canonical_name ??
				null,
			fieldLabel: trace?.field ? formatFieldLabel(trace.field) : null,
			query: (data.query as string | undefined) || null,
			filters: (data.segmentFilters as Record<string, string | null> | undefined) ?? undefined,
			area: (data.explore as { filters?: { district?: string | null } } | undefined)?.filters
				?.district,
			anchor: null
		})
	);

	// The closing tag is split so this string cannot end the block that renders it.
	const jsonLdTag = $derived(
		crumbs.length > 1
			? `<script type="application/ld+json">${breadcrumbJsonLd(crumbs, page.url.origin)}</` +
					`script>`
			: ''
	);
</script>

<svelte:head>
	<!-- The same trail as JSON-LD, from the same data, so a crawler is told what a reader is. The
	     value is JSON with every "<" escaped, so it cannot carry markup out of the block. -->
	{#if jsonLdTag}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLdTag}
	{/if}
</svelte:head>

<div class="flex min-h-screen flex-col bg-canvas text-ink">
	<AppHeader {packs} country={scopedCountry} />
	<main
		class="flex w-full flex-1 flex-col gap-4 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10 {width ===
		'reading'
			? 'max-w-reading'
			: ''}"
	>
		<Breadcrumbs {crumbs} />
		{@render children()}
	</main>
	<AppFooter {regeneration} />
</div>
