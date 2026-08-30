<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import GitBranch from '@lucide/svelte/icons/git-branch';

	/**
	 * Why one register's value won. The ladder is the pack's own precedence order, with the rank
	 * that supplied the published value marked: a reader should never have to take "this is the
	 * canonical value" on trust.
	 */
	let {
		ranks,
		activeRank
	}: { ranks: { rank: number; label: string; explanation: string }[]; activeRank?: number } =
		$props();
</script>

<ol class="flex flex-col gap-1">
	{#each ranks as step (step.rank)}
		<li
			class="flex items-start gap-3 rounded-md border px-3 py-2 {step.rank === activeRank
				? 'border-accent bg-accent-tint'
				: 'border-border bg-surface'}"
			aria-current={step.rank === activeRank ? 'step' : undefined}
		>
			<span class="mt-0.5 tnum text-xs text-ink-muted">{step.rank}</span>
			<span class="flex flex-col gap-0.5">
				<span class="flex items-center gap-2 text-base text-ink">
					{#if step.rank === activeRank}
						<GitBranch size={16} strokeWidth={1.5} aria-hidden="true" />
					{/if}
					{step.label}
				</span>
				<span class="text-xs text-ink-muted">{step.explanation}</span>
			</span>
		</li>
	{/each}
</ol>
