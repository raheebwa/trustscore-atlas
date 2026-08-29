<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>TrustScore Atlas: Not found</title>
</svelte:head>

<div class="py-12 text-center">
	<h1 class="text-2xl font-semibold text-stone-900">Business not found</h1>
	<p class="mt-2 text-stone-600">{page.error?.message ?? 'That atlas_id does not exist.'}</p>
	<p class="mt-4">
		<a href={resolve('/search')} class="text-stone-600 underline hover:text-stone-900"
			>Try a search instead</a
		>
	</p>
</div>
