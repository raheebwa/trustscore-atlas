<script lang="ts">
	import type { Snippet } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Check from '@lucide/svelte/icons/check';

	type Tone = 'info' | 'warning' | 'error' | 'success';

	let {
		tone = 'info',
		title,
		children
	}: { tone?: Tone; title?: string; children: Snippet } = $props();

	// A full border and a tint, never a side stripe: the tone has to survive being read in one
	// glance next to a table of numbers.
	const tones: Record<Tone, string> = {
		info: 'border-border-strong bg-panel text-ink',
		warning: 'border-warning-border bg-warning-surface text-accent-ink',
		error: 'border-error-border bg-error-surface text-error-ink',
		success: 'border-success-fill bg-success-surface text-success-ink'
	};
	const icons = { info: Info, warning: AlertTriangle, error: CircleAlert, success: Check };
	const Icon = $derived(icons[tone]);
</script>

<div
	class="flex gap-3 rounded-md border p-4 {tones[tone]}"
	role={tone === 'error' ? 'alert' : undefined}
>
	<Icon size={20} strokeWidth={1.5} class="mt-0.5 shrink-0" />
	<div class="flex flex-col gap-1">
		{#if title}<p class="font-medium">{title}</p>{/if}
		<div class="text-base">{@render children()}</div>
	</div>
</div>
