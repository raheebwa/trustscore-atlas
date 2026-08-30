<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import Globe from '@lucide/svelte/icons/globe';
	import type { Pack } from '$lib/server/packs';

	/**
	 * The one place a visitor changes what every page is about. The mark always goes home and
	 * never carries a filter; the search field is present on every route so a query is never more
	 * than a keystroke away; the country switch scopes the whole site, which is why it sits here
	 * rather than inside a page's filters.
	 */
	let { packs = [], country }: { packs?: Pack[]; country: string } = $props();

	const NAV = [
		{ href: resolve('/search'), label: 'Search' },
		{ href: resolve('/explore'), label: 'Explore' },
		{ href: resolve('/sources'), label: 'Sources' },
		{ href: resolve('/methodology'), label: 'Methodology' },
		{ href: resolve('/downloads'), label: 'Downloads' },
		{ href: resolve('/tools'), label: 'Actions' }
	] as const;

	let searchInput = $state<HTMLInputElement | null>(null);
	let query = $state('');

	function isCurrent(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	// "/" is the search shortcut every data tool has; it must never steal a real keystroke.
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
			return;
		}
		event.preventDefault();
		searchInput?.focus();
	}

	// Every other query parameter travels with the switch so a scoped page keeps its filters.
	const carried = $derived(
		[...page.url.searchParams.entries()].filter(([key]) => key !== 'country' && key !== 'cursor')
	);
</script>

<svelte:window onkeydown={onKeydown} />

<header class="border-b border-border bg-panel">
	<div class="mx-auto flex max-w-data flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-ink"
		>
			<img src="/brand/trustscore-mark.svg" alt="" class="h-6 w-auto" aria-hidden="true" />
			<span>Atlas</span>
		</a>

		<form
			method="get"
			action={resolve('/search')}
			class="order-last flex min-w-0 grow basis-full items-center gap-2 md:order-none md:basis-64"
			role="search"
		>
			<label class="sr-only" for="site-search">Search businesses</label>
			<div class="relative w-full">
				<Search
					size={20}
					strokeWidth={1.5}
					class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-muted"
				/>
				<input
					bind:this={searchInput}
					bind:value={query}
					id="site-search"
					name="q"
					type="search"
					placeholder="Search a business name"
					class="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-base text-ink transition-colors duration-120 placeholder:text-ink-muted hover:border-border-strong"
				/>
			</div>
			<input type="hidden" name="country" value={country} />
			<kbd
				class="hidden h-6 shrink-0 items-center rounded border border-border bg-panel-2 px-1.5 text-2xs text-ink-muted md:inline-flex"
				>/</kbd
			>
		</form>

		<nav aria-label="Sections" class="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm">
			{#each NAV as item (item.href)}
				<a
					href={item.href}
					aria-current={isCurrent(item.href) ? 'page' : undefined}
					class="rounded-sm py-1 font-medium text-ink-muted transition-colors duration-120 hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
				>
					{item.label}
				</a>
			{/each}
		</nav>

		{#if packs.length > 1}
			<form method="get" class="flex shrink-0 items-center gap-2">
				{#each carried as [key, value], index (`${key}-${index}`)}
					<input type="hidden" name={key} {value} />
				{/each}
				<Globe size={20} strokeWidth={1.5} class="text-ink-muted" aria-hidden="true" />
				<label class="sr-only" for="country-switch">Country pack</label>
				<select
					id="country-switch"
					name="country"
					class="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink transition-colors duration-120 hover:border-border-strong"
					value={country}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					{#each packs as pack (pack.code)}
						<option value={pack.code}>{pack.code} · {pack.name}</option>
					{/each}
				</select>
				<noscript><button type="submit" class="text-xs underline">Switch</button></noscript>
			</form>
		{/if}
	</div>
</header>
