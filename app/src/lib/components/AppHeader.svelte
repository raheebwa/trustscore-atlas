<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { Popover } from 'bits-ui';
	import Menu from '@lucide/svelte/icons/menu';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import CountrySwitch from './CountrySwitch.svelte';
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
		{ href: resolve('/tools'), label: 'Tools' }
	] as const;

	let searchInput = $state<HTMLInputElement | null>(null);
	let query = $state('');
	// Home leads with its own search field. Two identical boxes on one screen is one too many, so
	// the header yields there; the shortcut still lands in the hero's field.
	const onHome = $derived(page.route.id === '/');

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
		const field =
			searchInput ?? (document.getElementById('home-search') as HTMLInputElement | null);
		field?.focus();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<header class="border-b border-border bg-panel">
	<div
		class="flex w-full flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:gap-x-6 lg:px-6 xl:px-8 2xl:px-10"
	>
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-ink"
		>
			<img src="/brand/trustscore-mark.svg" alt="" class="h-6 w-auto" aria-hidden="true" />
			<span>Atlas</span>
		</a>

		{#if !onHome}
			<form
				method="get"
				action={resolve('/search')}
				class="flex min-w-0 grow basis-40 items-center gap-2 md:basis-64"
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
		{:else}
			<span class="grow"></span>
		{/if}

		<!--
			Below md the sections collapse into one menu button. Four rows of navigation before the
			page begins is a phone screen spent on chrome, and the two controls that scope the site,
			search and country, are the ones that stay visible.
		-->
		<nav aria-label="Sections" class="hidden min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm md:flex">
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

		<Popover.Root>
			<!-- One button on a phone: the sections and the country switch live behind it, so the
			     header is a single row and the page starts at the top of the screen. -->
			<Popover.Trigger
				aria-label="Sections and country"
				class="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors duration-120 hover:border-border-strong md:hidden"
			>
				<Menu size={20} strokeWidth={1.5} aria-hidden="true" />
				<span class="sr-only sm:not-sr-only">Sections</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					sideOffset={6}
					class="z-30 flex w-56 flex-col gap-1 rounded-md border border-border-strong bg-surface p-1 shadow-lg"
				>
					{#each NAV as item (item.href)}
						<a
							href={item.href}
							aria-current={isCurrent(item.href) ? 'page' : undefined}
							class="rounded-sm px-3 py-2 text-base text-ink transition-colors duration-120 hover:bg-panel aria-[current=page]:bg-accent-tint"
						>
							{item.label}
						</a>
					{/each}
					{#if packs.length > 1}
						<!-- The switch that scopes the site travels with the sections on a phone. -->
						<div class="border-t border-border px-3 py-2">
							<CountrySwitch {packs} {country} />
						</div>
					{/if}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>

		{#if packs.length > 1}
			<div class="hidden md:block">
				<CountrySwitch {packs} {country} />
			</div>
		{/if}
	</div>
</header>
