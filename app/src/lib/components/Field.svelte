<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		label,
		hint,
		error,
		labelHidden = false,
		children
	}: {
		id: string;
		label: string;
		hint?: string;
		error?: string;
		labelHidden?: boolean;
		children: Snippet<[{ id: string; describedBy: string | undefined }]>;
	} = $props();

	// An error replaces the hint on screen, so it replaces it in the description too: pointing a
	// screen reader at text nobody can see is worse than pointing at nothing.
	const hintId = $derived(hint && !error ? `${id}-hint` : undefined);
	const errorId = $derived(error ? `${id}-error` : undefined);
	const describedBy = $derived(errorId ?? hintId);
</script>

<div class="flex flex-col gap-1">
	<label for={id} class={labelHidden ? 'sr-only' : 'text-xs font-medium text-ink-muted'}>
		{label}
	</label>
	{@render children({ id, describedBy })}
	{#if hint && !error}
		<p id={hintId} class="text-xs text-ink-muted">{hint}</p>
	{/if}
	{#if error}
		<p id={errorId} class="text-xs text-error-ink">{error}</p>
	{/if}
</div>
