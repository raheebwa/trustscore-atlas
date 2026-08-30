<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Copy from '@lucide/svelte/icons/copy';
	import { identifierKey, summariseIdentifiers } from '$lib/format';
	import { showToast } from './toast-state.svelte';
	import type { Identifier } from '$lib/types';

	let { identifiers, copyable = false }: { identifiers: Identifier[]; copyable?: boolean } =
		$props();

	const summary = $derived(summariseIdentifiers(identifiers));

	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			showToast(`Copied ${value}`, 'success');
		} catch {
			showToast('Your browser would not let the page copy that', 'error');
		}
	}
</script>

{#if summary.length > 0}
	<ul class="flex flex-wrap gap-2">
		{#each summary as line, index (identifierKey(identifiers[index] ?? { scheme: line, value: line, source: '' }))}
			<li
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1 font-mono text-2xs text-ink"
			>
				<span>{line}</span>
				{#if copyable}
					<button
						type="button"
						class="text-ink-muted transition-colors duration-120 hover:text-ink"
						aria-label={`Copy ${line}`}
						onclick={() => copy(line)}
					>
						<Copy size={14} strokeWidth={1.5} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
