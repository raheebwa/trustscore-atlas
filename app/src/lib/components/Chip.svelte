<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import X from '@lucide/svelte/icons/x';

	let {
		label,
		value,
		onDismiss,
		dismissLabel
	}: {
		label: string;
		value: string;
		onDismiss?: () => void;
		dismissLabel?: string;
	} = $props();
</script>

<span
	class="inline-flex items-center gap-2 rounded-md border border-accent bg-accent-tint px-2 py-1 text-xs text-ink"
>
	<span class="text-ink-muted">{label}</span>
	<span class="font-medium">{value}</span>
	{#if onDismiss}
		<button
			type="button"
			class="rounded-sm text-ink-muted transition-colors duration-120 hover:text-ink"
			aria-label={dismissLabel ?? `Remove the ${label} filter`}
			onclick={onDismiss}
		>
			<X size={14} strokeWidth={1.5} />
		</button>
	{/if}
</span>
