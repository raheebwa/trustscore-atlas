<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Map from '@lucide/svelte/icons/map';
	import Scale from '@lucide/svelte/icons/scale';
	import Terminal from '@lucide/svelte/icons/terminal';
	import Plus from '@lucide/svelte/icons/plus';
	import FreshnessBadge from '$lib/components/FreshnessBadge.svelte';
	import RegisterBadge from '$lib/components/RegisterBadge.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { formatWhen, nextScheduledRun } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const stats = $derived(data.stats);

	// Copy never names a country: adding a pack changes these numbers, not any sentence here.
	const packCount = $derived(data.packs.length);
	const loadedForCountry = $derived(
		stats.sources.filter(
			(source) => source.status !== 'not_loaded' && source.country === data.country
		)
	);
	const dueDate = (source: { cadence: string; last_run_at: string | null }) => {
		const next = nextScheduledRun(source.cadence, source.last_run_at);
		return formatWhen(next, { showTime: false })?.absolute ?? next;
	};

	const ENTRIES = [
		{
			href: resolve('/explore'),
			title: 'Explore',
			body: 'Counts by district, register and sector, with a map you can filter from.',
			icon: Map
		},
		{
			href: resolve('/methodology'),
			title: 'Methodology',
			body: 'What a score is made of, what it is not, and how a value wins its field.',
			icon: Scale
		},
		{
			href: resolve('/tools'),
			title: 'Tools',
			body: 'The same reads and writes an agent can call, runnable here in the page.',
			icon: Terminal
		}
	];
</script>

<svelte:head>
	<title>TrustScore Atlas</title>
</svelte:head>

<div class="flex flex-col gap-10">
	<!-- The thesis, then the one control that acts on it. -->
	<section class="grid gap-8 lg:grid-cols-2 lg:items-start">
		<div class="flex flex-col gap-4">
			<h1 class="font-display text-3xl text-ink">
				Public business registers, harmonised, with every value cited.
			</h1>
			<p class="max-w-prose text-base text-ink-muted">
				One record per business, each field carrying the register that published it and the date it
				said so, with what has not been checked shown as plainly as what has.
			</p>
			<form method="get" action={resolve('/search')} class="flex flex-wrap gap-2">
				<label class="sr-only" for="home-search">Search businesses</label>
				<div class="relative min-w-56 grow">
					<Search
						size={20}
						strokeWidth={1.5}
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
					/>
					<input
						id="home-search"
						name="q"
						type="search"
						placeholder="Search a business name"
						class="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-10 text-base text-ink transition-colors duration-120 placeholder:text-ink-muted hover:border-border-strong"
					/>
				</div>
				<input type="hidden" name="country" value={data.country} />
				<button
					type="submit"
					class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
				>
					Search
				</button>
			</form>
		</div>

		<div class="flex flex-col gap-6 rounded-md border border-border bg-surface p-6">
			<StatTile
				label="Businesses"
				value={stats.businessCount}
				caption={`Across ${packCount} country ${packCount === 1 ? 'pack' : 'packs'} and ${stats.loadedSourceCount} of ${stats.sourceCount} registers.`}
				emphasis="lead"
			/>
			<div class="flex flex-col gap-2">
				<p class="text-xs font-medium text-ink-muted">Registers loaded, across all country packs</p>
				<ul class="flex flex-wrap gap-2">
					{#each stats.sources as source (source.slug)}
						<li>
							<RegisterBadge slug={source.slug} muted={source.status === 'not_loaded'} />
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<!-- One tile per loaded pack. At a hundred packs this becomes a list; the page does not change. -->
	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-semibold text-ink">Country packs</h2>
		<ul class="flex gap-3 overflow-x-auto pb-2">
			{#each data.packs as pack (pack.code)}
				<li
					class="flex min-w-56 flex-col gap-1 rounded-md border border-border bg-surface p-4 {pack.code ===
					data.country
						? 'border-accent bg-accent-tint'
						: ''}"
				>
					<p class="flex items-baseline gap-2">
						<span class="font-mono text-2xs text-ink-muted">{pack.code}</span>
						<span class="text-base font-medium text-ink">{pack.name}</span>
					</p>
					<p class="font-display tnum text-2xl text-ink">{pack.businesses.toLocaleString()}</p>
					<p class="text-xs text-ink-muted">businesses in the published regeneration</p>
				</li>
			{/each}
			<li
				class="flex min-w-56 flex-col justify-center gap-2 rounded-md border border-dashed border-border bg-panel p-4"
			>
				<p class="flex items-center gap-2 text-base text-ink-muted">
					<Plus size={20} strokeWidth={1.5} aria-hidden="true" />
					Add a country pack
				</p>
				<a href={resolve('/methodology')} class="text-xs text-ink-muted underline hover:text-ink">
					What a pack has to declare
				</a>
			</li>
		</ul>
	</section>

	<!-- How current the data is, said once, in words. -->
	<section class="flex flex-col gap-3">
		<h2 class="flex items-center gap-2 text-xl font-semibold text-ink">
			<RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" />
			How current this is
		</h2>
		<p class="max-w-prose text-base text-ink-muted">
			Registers are pulled on their own cadence. Each one says when it last succeeded and when it is
			next due, so a stale register is visible before anyone leans on what it published.
		</p>
		<ul class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each loadedForCountry as source (source.slug)}
				<li class="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
					<RegisterBadge slug={source.slug} />
					<FreshnessBadge
						status={source.status}
						lastRunAt={source.last_run_at}
						cadence={source.cadence}
					/>
					<p class="text-2xs text-ink-muted">
						Next due {dueDate(source)}
					</p>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Three ways in, each saying what it holds rather than repeating the nav. -->
	<section class="grid gap-3 md:grid-cols-3">
		{#each ENTRIES as entry (entry.href)}
			<a
				href={entry.href}
				class="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 transition-colors duration-120 hover:border-border-strong hover:bg-panel"
			>
				<span class="flex items-center gap-2 text-base font-medium text-ink">
					<entry.icon size={20} strokeWidth={1.5} aria-hidden="true" />
					{entry.title}
				</span>
				<span class="text-xs text-ink-muted">{entry.body}</span>
			</a>
		{/each}
	</section>
</div>
