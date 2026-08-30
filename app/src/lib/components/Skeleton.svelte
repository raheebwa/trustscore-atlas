<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	let {
		variant = 'text',
		lines = 1,
		width,
		label = 'Loading'
	}: {
		variant?: 'text' | 'bar' | 'row' | 'block';
		lines?: number;
		width?: string;
		label?: string;
	} = $props();

	const heights = { text: 'h-4', bar: 'h-3', row: 'h-11', block: 'h-64' };
</script>

<div role="status" aria-label={label} class="flex w-full flex-col gap-2">
	{#each Array.from({ length: variant === 'text' ? lines : 1 }), index (index)}
		<div
			class="skeleton {heights[variant]}"
			style={width
				? `width: ${width}`
				: index === lines - 1 && lines > 1
					? 'width: 60%'
					: undefined}
		></div>
	{/each}
</div>
