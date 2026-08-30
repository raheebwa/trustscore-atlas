<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import './layout.css';
	import AppShell from '$lib/components/AppShell.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import WebMcpRegistration from '$lib/webmcp/WebMcpRegistration.svelte';
	import { formatWhen } from '$lib/format';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The footer says when the data was last refreshed, not which regeneration produced it: the
	// id belongs on the downloads page, in the API and in tool results.
	const refreshed = $derived(
		formatWhen(data.regeneration ? regenerationInstant(data.regeneration) : null)
	);

	/** Regeneration ids are stamped as 20260830T045242Z, which is an ISO instant without separators. */
	function regenerationInstant(id: string): string | null {
		const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(id);
		return match
			? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
			: null;
	}
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/brand/trustscore-mark.svg" />
	<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png" />
	<link rel="icon" type="image/png" sizes="192x192" href="/brand/favicon-192.png" />
	<link rel="apple-touch-icon" sizes="192x192" href="/brand/favicon-192.png" />
	<meta property="og:site_name" content="TrustScore Atlas" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="TrustScore Atlas" />
	<meta
		property="og:description"
		content="Public business registers, harmonised, with every value cited: one record per business, field-level provenance, deterministic scores, and tools any agent can call."
	/>
	<meta property="og:image" content="https://atlas.trustscorehq.com/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TrustScore Atlas" />
	<meta name="twitter:image" content="https://atlas.trustscorehq.com/og.png" />
</svelte:head>

<WebMcpRegistration />

<AppShell
	packs={data.packs}
	country={data.country}
	countryName={data.countryName}
	regeneration={refreshed ? `Data refreshed ${refreshed.text}` : undefined}
>
	{@render children()}
</AppShell>

<Toast />
