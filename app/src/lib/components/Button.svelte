<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Tone = 'primary' | 'secondary' | 'quiet' | 'danger';

	/**
	 * One button vocabulary for the whole site. A link that acts as a button passes `as="link"`
	 * and its own resolved href through the rest props, so route resolution stays at the call
	 * site where the route is known.
	 */
	let {
		as = 'button',
		tone = 'secondary',
		size = 'md',
		loading = false,
		loadingLabel = 'Working',
		class: extra = '',
		children,
		icon,
		...rest
	}: {
		as?: 'button' | 'link';
		tone?: Tone;
		size?: 'sm' | 'md';
		loading?: boolean;
		loadingLabel?: string;
		class?: string;
		children: Snippet;
		icon?: Snippet;
	} & HTMLButtonAttributes &
		HTMLAnchorAttributes = $props();

	// Gold is a fill and never a text colour, so the primary action is the one place it appears at
	// full strength; every other tone is ink on a neutral.
	const tones: Record<Tone, string> = {
		primary:
			'bg-accent text-ink border-accent hover:bg-accent-ink hover:text-canvas hover:border-accent-ink',
		secondary: 'bg-surface text-ink border-border hover:bg-panel hover:border-border-strong',
		quiet: 'bg-transparent text-ink border-transparent hover:bg-panel',
		danger: 'bg-surface text-error-ink border-error-border hover:bg-error-surface'
	};
	const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-base' };
	const shell = $derived(
		`inline-flex items-center gap-2 rounded-md border font-medium transition-colors duration-120 ${tones[tone]} ${sizes[size]} ${extra}`
	);
</script>

{#snippet body()}
	{#if icon}<span class="shrink-0">{@render icon()}</span>{/if}
	{#if loading}
		<span>{loadingLabel}</span>
	{:else}
		{@render children()}
	{/if}
{/snippet}

{#if as === 'link'}
	<a class={shell} {...rest as HTMLAnchorAttributes}>
		{@render body()}
	</a>
{:else}
	<button
		class={shell}
		aria-busy={loading || undefined}
		disabled={loading || (rest as HTMLButtonAttributes).disabled}
		{...rest as HTMLButtonAttributes}
	>
		{@render body()}
	</button>
{/if}
