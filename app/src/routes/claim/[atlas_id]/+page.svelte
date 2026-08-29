<script lang="ts">
	import { resolve } from '$app/paths';
	import { CLAIM_VERIFICATION_STEPS } from '$lib/claims';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>TrustScore Atlas: Request a claim</title>
</svelte:head>

<h1 class="text-2xl font-semibold text-stone-900">Request a business claim</h1>
<p class="mt-2 text-stone-700">
	This records a claim request for <strong>{data.business.canonical_name}</strong>. It does not
	create a verified claim.
</p>
<p class="mt-1 text-sm text-stone-500">atlas_id: {data.business.atlas_id}</p>

<form method="post" action={resolve('/api/v1/claims')} class="mt-6 max-w-xl space-y-4">
	<input type="hidden" name="atlas_id" value={data.business.atlas_id} />
	<label class="block">
		<span class="block text-sm font-medium text-stone-700">Your role</span>
		<select
			name="claimant_role"
			required
			class="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
		>
			<option value="">Choose a role</option>
			<option value="owner or director">Owner or director</option>
			<option value="authorised employee">Authorised employee</option>
			<option value="authorised representative">Authorised representative</option>
		</select>
	</label>
	<button
		type="submit"
		class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700"
	>
		Record claim request
	</button>
</form>

<section class="mt-8">
	<h2 class="text-lg font-semibold text-stone-900">Verification routes</h2>
	<ol class="mt-2 list-decimal space-y-2 pl-5 text-stone-700">
		{#each CLAIM_VERIFICATION_STEPS as step (step)}
			<li>{step}</li>
		{/each}
	</ol>
</section>
