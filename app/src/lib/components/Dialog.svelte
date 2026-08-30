<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { Dialog } from 'bits-ui';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		trigger,
		children
	}: {
		open?: boolean;
		title: string;
		description?: string;
		trigger?: Snippet;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	{#if trigger}
		<Dialog.Trigger>{@render trigger()}</Dialog.Trigger>
	{/if}
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-ink/30" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-surface p-6 shadow-xl"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-col gap-1">
					<Dialog.Title class="text-lg font-semibold text-ink">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description class="text-sm text-ink-muted">{description}</Dialog.Description>
					{/if}
				</div>
				<Dialog.Close
					class="rounded-md p-1 text-ink-muted transition-colors duration-120 hover:bg-panel hover:text-ink"
					aria-label="Close"
				>
					<X size={20} strokeWidth={1.5} />
				</Dialog.Close>
			</div>
			<div class="mt-4">{@render children()}</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
