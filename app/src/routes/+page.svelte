<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Map from '@lucide/svelte/icons/map';
	import Scale from '@lucide/svelte/icons/scale';
	import Terminal from '@lucide/svelte/icons/terminal';
	import FreshnessBadge from '$lib/components/FreshnessBadge.svelte';
	import RegisterBadge from '$lib/components/RegisterBadge.svelte';
	import { packFreshness } from '$lib/registers';
	import StatTile from '$lib/components/StatTile.svelte';
	import { formatWhen, nextScheduledRun } from '$lib/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const stats = $derived(data.stats);

	// Copy never names a country: adding a pack changes these numbers, not any sentence here.
	// Everything on this page above the pack list is the country in the header switch and nothing
	// else, because a register from another pack sitting beside this one reads as belonging to it.
	const forCountry = $derived(stats.sources.filter((source) => source.country === data.country));
	const loadedForCountry = $derived(forCountry.filter((source) => source.status !== 'not_loaded'));
	const notLoadedForCountry = $derived(
		forCountry.filter((source) => source.status === 'not_loaded')
	);
	const pack = $derived(data.packs.find((entry) => entry.code === data.country));
	const packLoaded = (code: string) =>
		stats.sources.filter((source) => source.country === code && source.status !== 'not_loaded')
			.length;
	const packRegisters = (code: string) =>
		stats.sources.filter((source) => source.country === code).length;
	/** One dot per pack, so a pack with a stale or failed register says so beside its number. */
	const DOT_TONES: Record<string, string> = {
		fresh: 'bg-fresh',
		stale: 'bg-accent-ink',
		failed: 'bg-error-ink',
		none: 'bg-border-strong'
	};
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
				Check any business against the public registers.
			</h1>
			<p class="max-w-prose text-base text-ink-muted">
				Type a name or tax number. See which government registers know it, its licences and permits,
				its scores, and the date each fact was published. Free and open, for people and AI agents.
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
				value={pack?.businesses ?? 0}
				caption={`${loadedForCountry.length} of ${forCountry.length} ${
					forCountry.length === 1 ? 'register' : 'registers'
				} loaded.`}
				emphasis="lead"
			/>
			<p class="text-base text-ink-muted">Every fact links to the register that published it.</p>
		</div>
	</section>

	<!--
		The registers behind the number above, in one band across the page, said in two rows rather
		than one row of chips some of which are dimmer than others: muted on its own says nothing.
	-->
	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-semibold text-ink">Registers in this pack</h2>
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium text-ink-muted">Loaded</p>
			<ul class="flex flex-wrap gap-2">
				{#each loadedForCountry as source (source.slug)}
					<li><RegisterBadge slug={source.slug} /></li>
				{/each}
			</ul>
		</div>
		{#if notLoadedForCountry.length > 0}
			<div class="flex flex-col gap-2">
				<p class="text-xs font-medium text-ink-muted">Not yet loaded</p>
				<ul class="flex flex-wrap gap-2">
					{#each notLoadedForCountry as source (source.slug)}
						<li><RegisterBadge slug={source.slug} muted /></li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<!--
		One tile per loaded pack, and the only place a cross-pack total belongs: above this section
		every number is the country in the switch.
	-->
	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-semibold text-ink">Country packs</h2>
		<!--
			The list scrolls sideways on a narrow screen, so it takes focus and a name: a region that
			scrolls but cannot be reached by keyboard is content a keyboard user cannot see. That is
			the one case where a list carries a tab stop, which is why the rule is waived here and
			nowhere else.
		-->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<ul class="flex gap-3 overflow-x-auto pb-2" tabindex="0" aria-label="Country packs">
			{#each data.packs as pack (pack.code)}
				{@const freshness = packFreshness(stats.sources, pack.code)}
				<li
					class="flex min-w-56 flex-col gap-1 rounded-md border border-border bg-surface p-4 {pack.code ===
					data.country
						? 'border-accent bg-accent-tint'
						: ''}"
				>
					<p class="flex items-baseline gap-2">
						<span class="font-mono text-2xs text-ink-muted">{pack.code}</span>
						<span class="text-base font-medium text-ink">{pack.name}</span>
						<span
							class="ml-auto size-2 rounded-full {DOT_TONES[freshness.state]}"
							title={freshness.label}
							aria-hidden="true"
						></span>
						<span class="sr-only">{freshness.label}</span>
					</p>
					<p class="font-display tnum text-2xl text-ink">{pack.businesses.toLocaleString()}</p>
					<p class="text-xs text-ink-muted">businesses published</p>
					<p class="text-xs text-ink-muted">
						{packLoaded(pack.code)} of {packRegisters(pack.code)}
						{packRegisters(pack.code) === 1 ? 'register' : 'registers'} loaded
					</p>
				</li>
			{/each}
		</ul>
		<p class="text-xs text-ink-muted">
			{stats.businessCount.toLocaleString()} businesses across every pack, from
			{stats.loadedSourceCount} of {stats.sourceCount} registers.
		</p>
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
		<ul class="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
