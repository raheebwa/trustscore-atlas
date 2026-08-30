<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { toasts, type ToastMessage } from './toast-state.svelte';

	const tones: Record<ToastMessage['tone'], string> = {
		info: 'border-border-strong bg-panel text-ink',
		success: 'border-success-fill bg-success-surface text-success-ink',
		error: 'border-error-border bg-error-surface text-error-ink'
	};
</script>

<div
	role="status"
	aria-live="polite"
	class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
>
	{#if toasts.current}
		<p class="rounded-md border px-4 py-2 text-sm shadow-lg {tones[toasts.current.tone]}">
			{toasts.current.text}
		</p>
	{/if}
</div>
