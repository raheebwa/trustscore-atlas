<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { resolve } from '$app/paths';

	let { regeneration }: { regeneration?: string } = $props();
</script>

<footer class="border-t border-border bg-panel">
	<div
		class="mx-auto flex max-w-data flex-col gap-4 px-4 py-6 text-sm text-ink-muted md:flex-row md:items-start md:justify-between"
	>
		<div class="flex max-w-prose flex-col gap-2">
			<img src="/brand/trustscore-wordmark.svg" alt="TrustScore" class="h-5 w-auto self-start" />
			<p>
				Atlas harmonises public business records published by government registers. It is not a
				credit or fraud verdict. Every value links to the register that published it.
			</p>
		</div>
		<div class="flex flex-col gap-1">
			{#if regeneration}<p class="tnum">{regeneration}</p>{/if}
			<a href={resolve('/methodology')} class="underline hover:text-ink">How the scores work</a>
			<a href={resolve('/downloads')} class="underline hover:text-ink">Download the data</a>
		</div>
	</div>
</footer>
