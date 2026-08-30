<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import WebMcpRegistration from '$lib/webmcp/WebMcpRegistration.svelte';

	let { children } = $props();
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
		content="Public business registers of Uganda and Kenya, harmonised into one record per business with field-level provenance, deterministic scores and tools any agent can call."
	/>
	<meta property="og:image" content="https://atlas.trustscorehq.com/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TrustScore Atlas" />
	<meta name="twitter:image" content="https://atlas.trustscorehq.com/og.png" />
</svelte:head>

<WebMcpRegistration />

<div class="flex min-h-screen flex-col bg-stone-50 text-stone-900">
	<header class="border-b border-stone-200 bg-white">
		<div
			class="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4"
		>
			<a
				href={resolve('/')}
				class="flex items-center gap-2 text-lg font-semibold tracking-tight text-stone-900"
			>
				<img src="/brand/trustscore-mark.svg" alt="TrustScore" class="h-6 w-auto" />
				<span>Atlas</span>
			</a>
			<nav class="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-stone-600">
				<a href={resolve('/search')} class="hover:text-stone-900">Search</a>
				<a href={resolve('/explore')} class="hover:text-stone-900">Explore</a>
				<a href={resolve('/sources')} class="hover:text-stone-900">Sources</a>
				<a href={resolve('/methodology')} class="hover:text-stone-900">Methodology</a>
				<a href={resolve('/downloads')} class="hover:text-stone-900">Downloads</a>
				<a href={resolve('/tools')} class="hover:text-stone-900">Actions</a>
			</nav>
		</div>
	</header>

	<main class="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
		{@render children()}
	</main>

	<footer class="border-t border-stone-200 bg-white">
		<div
			class="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-stone-500"
		>
			<img src="/brand/trustscore-wordmark.svg" alt="TrustScore" class="h-5 w-auto" />
			<p class="max-w-2xl">
				Atlas harmonises public business records published by government registers. It is not a
				credit or fraud verdict. Every value links to the register that published it.
			</p>
		</div>
	</footer>
</div>
