<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import { resolve } from '$app/paths';
	import { CLAIM_VERIFICATION_STEPS } from '$lib/claims';
	import { formatWhen } from '$lib/format';
	import Callout from '$lib/components/Callout.svelte';
	import Turnstile from '$lib/components/Turnstile.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const record = $derived(data.confirmation?.record);
	const requested = $derived(formatWhen(record?.requested_at ?? null));
	// A check can take several seconds against a slow site, and a second click would spend
	// another of the five attempts on the same question.
	let checking = $state(false);

	/** The domains a register published for this record, as a reader would say them. */
	const mailDomains = $derived((data.verification?.mail_domains ?? []).join(' or '));

	/** What a reader calls the file, rather than the media type it is stored as. */
	function documentLabel(contentType: string): string {
		if (contentType === 'application/pdf') return 'PDF document';
		if (contentType === 'image/png') return 'PNG image';
		if (contentType === 'image/jpeg') return 'JPEG image';
		return 'Document';
	}
	const challengeCloses = $derived(
		formatWhen(data.verification?.challenge?.expires_at ?? null, { showTime: false })?.text
	);
</script>

<svelte:head>
	<title>TrustScore Atlas: Request a claim</title>
</svelte:head>

<div class="flex max-w-reading flex-col gap-6">
	{#if data.confirmation}
		<PageHeader
			title="Claim request confirmation"
			lede="Check that this is the record you meant before confirming. A confirmed request is not a verified claim: verification happens afterwards, through one of the routes below."
		/>

		{#if data.confirmation.state === 'invalid' || !record}
			<EmptyState
				title="This confirmation link is not valid"
				body="A claim link works once and expires after 24 hours. Start again from the business record, and the page will issue a new one."
				examples={[{ label: 'Search for the business', href: resolve('/search') }]}
			/>
		{:else}
			{#if data.confirmation.state === 'unconfirmed'}
				<Callout tone="info" title="Not confirmed yet">
					Confirming records the request against this exact record.
				</Callout>
			{:else if data.confirmation.state === 'expired'}
				<Callout tone="warning" title="This request has expired">
					Claim links last 24 hours. Start again from the business record for a new one.
				</Callout>
			{:else if data.confirmation.state === 'confirmed'}
				<Callout tone="success" title="Already confirmed">
					This request is recorded and waiting for verification.
				</Callout>
			{/if}

			<dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-base">
				<dt class="text-xs text-ink-muted">Business</dt>
				<dd class="text-ink">{record.canonical_name}</dd>
				<dt class="text-xs text-ink-muted">atlas_id</dt>
				<dd class="font-mono text-2xs text-ink">{record.atlas_id}</dd>
				<dt class="text-xs text-ink-muted">Claimed role</dt>
				<dd class="text-ink">{record.claimant_role}</dd>
				<dt class="text-xs text-ink-muted">Requested</dt>
				<dd class="tnum text-ink" title={record.requested_at}>{requested?.text}</dd>
			</dl>

			{#if data.confirmation.state === 'unconfirmed'}
				<form
					method="post"
					action={resolve('/api/v1/claims/[claim_id]/confirm', { claim_id: record.claim_id })}
				>
					<input type="hidden" name="token" value={data.confirmation.token} />
					<button
						type="submit"
						class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
					>
						Confirm this request
					</button>
				</form>
			{/if}
		{/if}
	{:else if data.business}
		<PageHeader
			title="Claim this business"
			lede="This records a claim request for the business below. It does not make the claim true: a maintainer verifies it first, through one of the routes at the bottom of this page."
			meta={[data.business.canonical_name, data.business.atlas_id]}
		/>

		{#if data.challengeFailed}
			<Callout tone="warning" title="That did not go through">
				The check in front of this form did not pass. Reload the page and send it again.
			</Callout>
		{/if}

		{#if data.confirmationComplete}
			<Callout tone="success" title="Request recorded">
				It is confirmed and waiting for verification.
			</Callout>
			{#if data.verification}
				<Callout tone="warning" title="Keep this link">
					The address in your browser is the only way back to this claim. There is no account and no
					password: the link is what proves it is yours. Save it now. It stops working when the
					claim window closes.
				</Callout>
			{/if}
		{/if}

		{#if data.verification}
			<section class="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
				<h2 class="text-xl font-semibold text-ink">Verify this claim</h2>
				{#if data.verification.state === 'verified'}
					{#if data.verification.verification_method === 'domain_email'}
						<Callout tone="success" title="Mailbox confirmed">
							A link Atlas mailed to {data.verification.verified_domain} was opened and confirmed. That
							proves control of the domain, not that the business is yours, so a maintainer reviews the
							claim before anything about the record changes.
						</Callout>
					{:else}
						<Callout tone="success" title="Website control proved">
							Atlas found the string on {data.verification.verified_domain}. That proves you control
							that website. A maintainer reviews the claim itself before anything about the record
							changes.
						</Callout>
					{/if}
				{:else if data.verification.state === 'live' && data.verification.challenge?.method === 'domain_email'}
					<Callout tone="info" title="Check the address you gave">
						A confirmation link is on its way to it. The link lasts 30 minutes and works once.
						Opening it finishes this step.
					</Callout>
				{:else if data.verification.state === 'live' && data.verification.challenge}
					{@const challenge = data.verification.challenge}
					<p class="text-base text-ink-muted">
						Publish this string on {challenge.target}, either way round, then ask Atlas to check.
					</p>
					<p
						class="rounded-md border border-border-strong bg-panel-2 p-3 font-mono text-2xs text-ink"
					>
						{challenge.challenge_value}
					</p>
					<ol class="flex flex-col gap-2 text-base text-ink">
						<li>
							Put it in a file at <span class="font-mono text-2xs"
								>{challenge.target}/.well-known/atlas-claim.txt</span
							>, as the whole file.
						</li>
						<li>
							Or add <span class="font-mono text-2xs"
								>&lt;meta name="atlas-claim" content="{challenge.challenge_value}"&gt;</span
							>
							to the head of {challenge.target}.
						</li>
					</ol>
					<p class="text-xs text-ink-muted">
						{challenge.attempts_left} of 5 checks left.
						{#if challengeCloses}The challenge expires {challengeCloses}.{/if}
						{#if challenge.outcome && !challenge.outcome.startsWith('verified')}
							The last check said: {challenge.outcome.replaceAll('_', ' ')}.
						{/if}
					</p>
					<form
						method="post"
						action={`${resolve('/api/v1/claims/[claim_id]/verify/website', { claim_id: data.verification.claim_id })}`}
						onsubmit={() => (checking = true)}
					>
						<input type="hidden" name="token" value={data.verification.token} />
						<input type="hidden" name="challenge_id" value={challenge.challenge_id} />
						<button
							type="submit"
							disabled={checking || challenge.attempts_left === 0}
							class="h-10 rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
						>
							{checking ? 'Checking your website' : 'Check my website now'}
						</button>
					</form>
				{:else if data.verification.state === 'closed'}
					<Callout tone="warning" title="This check has closed">
						The claim window has passed, or the check was already used. Claim the business again to
						start a new one.
					</Callout>
				{:else}
					<Callout tone="info" title="No challenge on this claim yet">
						Claim the business again with your website address, and Atlas will give you a string to
						publish.
					</Callout>
				{/if}

				{#if data.verification.state !== 'verified' && data.verification.state !== 'closed' && data.verification.mail_domains.length > 0}
					<div class="flex flex-col gap-3 border-t border-border pt-3">
						<h3 class="text-base font-semibold text-ink">
							Or confirm from an address at {mailDomains}
						</h3>
						<p class="text-xs text-ink-muted">
							{data.verification.mail_domains.length > 1
								? 'These are the websites'
								: 'This is the website'}
							a register published for this business, so Atlas will mail a confirmation link to an address
							there and nowhere else. The link lasts 30 minutes and works once.
						</p>
						<form
							method="post"
							action={`${resolve('/api/v1/claims/[claim_id]/verify/email', { claim_id: data.verification.claim_id })}`}
							class="flex flex-col gap-2"
						>
							<input type="hidden" name="token" value={data.verification.token} />
							<input type="hidden" name="from" value="page" />
							<label class="flex max-w-md flex-col gap-1">
								<span class="text-xs font-medium text-ink-muted">Your address at that domain</span>
								<input
									name="email"
									type="email"
									required
									placeholder="you@{data.verification.mail_domains[0]}"
									class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
								/>
							</label>
							<button
								type="submit"
								class="h-10 w-fit rounded-md border border-border-strong bg-panel-2 px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent"
							>
								Mail me a link
							</button>
						</form>
					</div>
				{/if}
			</section>
		{/if}

		{#if data.verification && data.verification.state !== 'closed'}
			<section class="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
				<h2 class="text-xl font-semibold text-ink">Supporting documents</h2>
				<p class="text-base text-ink-muted">
					A document never verifies a claim: it can be forged and cannot be checked automatically.
					It is here so a maintainer reviewing the claim can see what you hold, such as a trading
					licence or a letter on the business's paper. Only maintainers can open what you attach.
				</p>

				{#if data.verification.documents.length > 0}
					<ul class="flex flex-col gap-2">
						{#each data.verification.documents as document (document.evidence_id)}
							<li
								class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border bg-panel-2 p-3"
							>
								<span class="text-base text-ink">{documentLabel(document.content_type)}</span>
								<span class="tnum text-xs text-ink-muted"
									>{formatWhen(document.uploaded_at)?.text}</span
								>
								{#if document.uploaded_note}
									<span class="text-xs text-ink-muted">{document.uploaded_note}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if data.verification.documents.length < 5}
					<form
						method="post"
						enctype="multipart/form-data"
						action={`${resolve('/api/v1/claims/[claim_id]/evidence', { claim_id: data.verification.claim_id })}`}
						class="flex flex-col gap-3"
					>
						<input type="hidden" name="token" value={data.verification.token} />
						<input type="hidden" name="from" value="page" />
						<label class="flex max-w-md flex-col gap-1">
							<span class="text-xs font-medium text-ink-muted">A PDF, PNG or JPEG, under 5 MB</span>
							<input
								type="file"
								name="file"
								required
								accept="application/pdf,image/png,image/jpeg"
								class="text-base text-ink file:mr-3 file:rounded-md file:border file:border-border file:bg-panel-2 file:px-3 file:py-1.5 file:text-base file:text-ink"
							/>
						</label>
						<label class="flex max-w-md flex-col gap-1">
							<span class="text-xs font-medium text-ink-muted">What it is, in a few words</span>
							<input
								name="note"
								maxlength="300"
								placeholder="Trading licence for 2026"
								class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
							/>
						</label>
						<button
							type="submit"
							class="h-10 w-fit rounded-md border border-border-strong bg-panel-2 px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent"
						>
							Attach this document
						</button>
					</form>
				{:else}
					<p class="text-xs text-ink-muted">
						Five documents are attached, which is the most a claim holds. Write to the maintainers
						if something else matters.
					</p>
				{/if}
			</section>
		{/if}

		<!--
			This form is also a tool the browser offers an agent, which is why its toolname and
			toolparamdescription attributes stay exactly as they are.
		-->
		<form
			method="post"
			action={resolve('/api/v1/claims')}
			class="flex flex-col gap-4"
			toolname="claim_business_form"
			tooldescription="Record a confirmed claim request for the business on this page. Submitting this form asserts the claimant's role, and issues a website string to publish when a website address is given. A maintainer reviews the claim before anything about the record changes."
		>
			<input
				type="hidden"
				name="atlas_id"
				value={data.business.atlas_id}
				toolparamdescription="Opaque atlas_id of the business on this page."
			/>
			<input
				type="hidden"
				name="verification_method"
				value="website_string"
				toolparamdescription="How the claimant will prove the claim. Only website_string is offered here, and it applies only when a website address is given."
			/>
			<label class="flex max-w-md flex-col gap-1">
				<span class="text-xs font-medium text-ink-muted"
					>Your business website, if you have one</span
				>
				<span class="text-2xs text-ink-muted">
					Atlas gives you a short string to publish on it. Publishing it proves you control the
					site, which is what turns a claim into a verified claim. You can leave this blank and
					verify another way later.
				</span>
				<input
					name="website_url"
					type="url"
					value={data.typed?.website_url ?? ''}
					placeholder="https://example.co.ug"
					toolparamdescription="Optional public https address of the claimed business. Giving one issues a string to publish on that site; leaving it empty records the claim without a website challenge."
					class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
				/>
			</label>
			<label class="flex max-w-sm flex-col gap-1">
				<span class="text-xs font-medium text-ink-muted">Your role</span>
				<select
					name="claimant_role"
					value={data.typed?.claimant_role ?? ''}
					required
					toolparamdescription="The claimant's relation to the business: owner or director, authorised employee, or authorised representative."
					class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
				>
					<option value="">Choose a role</option>
					<option value="owner or director">Owner or director</option>
					<option value="authorised employee">Authorised employee</option>
					<option value="authorised representative">Authorised representative</option>
				</select>
			</label>
			<Turnstile />
			<button
				type="submit"
				class="h-10 w-fit rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
			>
				Record this claim request
			</button>
		</form>

		<section class="flex flex-col gap-3">
			<h2 class="flex items-center gap-2 text-xl font-semibold text-ink">
				<ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" />
				How a claim gets verified
			</h2>
			<ol class="flex flex-col gap-2">
				{#each CLAIM_VERIFICATION_STEPS as step, index (step)}
					<li class="flex gap-3 rounded-md border border-border bg-surface p-3">
						<span class="tnum text-xs text-ink-muted">{index + 1}</span>
						<span class="text-base text-ink">{step}</span>
					</li>
				{/each}
			</ol>
			<p class="text-xs text-ink-muted">
				A verified claim never overwrites a register. It lets you file corrections that a maintainer
				reviews, and an approved correction appears at the next regeneration beside the register
				value it disagrees with.
			</p>
		</section>
	{/if}
</div>
