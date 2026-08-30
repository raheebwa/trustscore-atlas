<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	/**
	 * The check in front of a form a stranger can submit.
	 *
	 * It renders nothing at all when this deployment sets no site key, so a fork and a local
	 * checkout keep working exactly as they did, and the server is equally ungated there. When a key
	 * is set the widget writes its answer into the enclosing form as cf-turnstile-response, which is
	 * what the endpoint reads.
	 */
	import { page } from '$app/state';

	const siteKey = $derived(page.data.turnstileSiteKey as string | undefined);
</script>

<svelte:head>
	{#if siteKey}
		<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
	{/if}
</svelte:head>

{#if siteKey}
	<div class="cf-turnstile" data-sitekey={siteKey} data-theme="light" data-size="flexible"></div>
	<noscript>
		<p class="text-xs text-ink-muted">
			This form needs JavaScript for its automated-submission check. With it off, use the API
			instead: every form here posts to a documented endpoint.
		</p>
	</noscript>
{/if}
