<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Landmark from '@lucide/svelte/icons/landmark';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Package from '@lucide/svelte/icons/package';
	import Scale from '@lucide/svelte/icons/scale';
	import Gavel from '@lucide/svelte/icons/gavel';
	import Building from '@lucide/svelte/icons/building-2';
	import { describeRegister, type RegisterKind } from '$lib/registers';

	let { slug, muted = false }: { slug: string; muted?: boolean } = $props();

	const icons: Record<RegisterKind, typeof Landmark> = {
		regulator: Landmark,
		tax: Receipt,
		permit: Package,
		standards: Scale,
		procurement: Gavel,
		municipal: Building
	};
	const register = $derived(describeRegister(slug));
	const Icon = $derived(icons[register.kind]);
</script>

<span
	title={slug}
	class="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs {muted
		? 'bg-panel text-ink-muted'
		: 'bg-surface text-ink'}"
>
	<Icon size={16} strokeWidth={1.5} aria-hidden="true" />
	{register.short}
</span>
