<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import Clock from '@lucide/svelte/icons/clock';
	import { formatWhen, nextScheduledRun } from '$lib/format';

	/**
	 * How current a register is, in the words the sources page uses: fresh, stale, failed, or not
	 * yet checked. The exact instant stays in the title attribute; the badge says what a reader
	 * needs to decide whether to trust the row.
	 */
	let {
		status,
		lastRunAt,
		cadence
	}: { status: string; lastRunAt: string | null; cadence: string } = $props();

	const tones: Record<string, string> = {
		fresh: 'border-fresh/40 bg-success-surface text-success-ink',
		stale: 'border-warning-border bg-warning-surface text-accent-ink',
		failed: 'border-error-border bg-error-surface text-error-ink',
		not_loaded: 'border-border bg-panel text-ink-muted'
	};
	const labels: Record<string, string> = {
		fresh: 'Fresh',
		stale: 'Stale',
		failed: 'Failed',
		not_loaded: 'Not yet checked'
	};
	const when = $derived(formatWhen(lastRunAt, { showTime: false }));
	const tone = $derived(tones[status] ?? tones.not_loaded);
	const label = $derived(labels[status] ?? status);
	const next = $derived(nextScheduledRun(cadence, lastRunAt));
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs {tone}"
	title={lastRunAt ? `Last run ${lastRunAt}, next ${next}` : `Next run ${next}`}
>
	<Clock size={16} strokeWidth={1.5} aria-hidden="true" />
	<span>{label}</span>
	{#if when}<span class="tnum text-ink-muted">{when.relative}</span>{/if}
</span>
