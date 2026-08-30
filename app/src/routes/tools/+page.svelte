<script lang="ts">
	// SPDX-License-Identifier: Apache-2.0
	import { onMount } from 'svelte';
	import Copy from '@lucide/svelte/icons/copy';
	import Callout from '$lib/components/Callout.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		formatExecutionResult,
		normaliseInputSchema,
		valuesToArguments,
		type InputSchema
	} from '$lib/webmcp/browser';

	interface RegisteredAction {
		name: string;
		description: string;
		inputSchema?: unknown;
		annotations?: {
			readOnlyHint?: boolean;
			untrustedContentHint?: boolean;
		};
	}

	interface ActionView {
		registered: RegisteredAction;
		schema: InputSchema;
	}

	interface ModelContextLike extends EventTarget {
		getTools: () => Promise<RegisteredAction[]>;
		executeTool: (registered: RegisteredAction, argumentsJson: string) => Promise<string>;
	}

	interface ExecutionView {
		text: string;
		elapsedMs: number;
	}

	const CHROME_REQUIREMENT =
		'Chrome 152 or later with chrome://flags/#enable-webmcp-testing enabled (command line --enable-features=WebMCP), or Chrome for Android with the same flag.';

	let available = $state<boolean | null>(null);
	let actions = $state<ActionView[]>([]);
	let loading = $state(false);
	let running = $state<string | null>(null);
	let copied = $state<string | null>(null);
	let results = $state<Record<string, ExecutionView>>({});
	let context: ModelContextLike | null = null;

	async function refreshActions() {
		if (!context) return;
		loading = true;
		try {
			const registered = await context.getTools();
			actions = registered
				.map((item) => ({ registered: item, schema: normaliseInputSchema(item.inputSchema) }))
				.sort((left, right) => left.registered.name.localeCompare(right.registered.name));
		} catch {
			actions = [];
		} finally {
			loading = false;
		}
	}

	function formValues(
		form: HTMLFormElement,
		schema: InputSchema
	): Record<string, string | boolean> {
		const data = new FormData(form);
		const values: Record<string, string | boolean> = {};
		for (const [name, property] of Object.entries(schema.properties)) {
			if (property.type === 'boolean') {
				values[name] = data.has(name);
				continue;
			}
			const value = data.get(name);
			values[name] = typeof value === 'string' ? value : '';
		}
		return values;
	}

	async function runAction(event: SubmitEvent, action: ActionView) {
		event.preventDefault();
		if (!context || !(event.currentTarget instanceof HTMLFormElement)) return;
		const argumentsObject = valuesToArguments(
			action.schema,
			formValues(event.currentTarget, action.schema)
		);
		running = action.registered.name;
		copied = null;
		const started = performance.now();
		try {
			const returned = await context.executeTool(
				action.registered,
				JSON.stringify(argumentsObject)
			);
			results[action.registered.name] = {
				text: formatExecutionResult(returned),
				elapsedMs: performance.now() - started
			};
		} catch {
			results[action.registered.name] = {
				text: JSON.stringify({ error: 'request_failed' }, null, 2),
				elapsedMs: performance.now() - started
			};
		} finally {
			running = null;
		}
	}

	async function copyResult(name: string) {
		const result = results[name];
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.text);
			copied = name;
		} catch {
			copied = null;
		}
	}

	onMount(() => {
		const candidate = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
		if (
			!candidate ||
			typeof candidate.getTools !== 'function' ||
			typeof candidate.executeTool !== 'function'
		) {
			available = false;
			return;
		}
		available = true;
		context = candidate;
		const refresh = () => void refreshActions();
		candidate.addEventListener('toolchange', refresh);
		const frame = requestAnimationFrame(refresh);
		return () => {
			cancelAnimationFrame(frame);
			candidate.removeEventListener('toolchange', refresh);
		};
	});
</script>

<svelte:head><title>TrustScore Atlas: Actions</title></svelte:head>

<div class="flex flex-col gap-6">
	<PageHeader
		title="Atlas actions"
		lede="The same reads and writes an agent can call, runnable here in the page. A read answers from the published regeneration; a write records a request that a maintainer reviews, and never changes a published record on its own."
	/>

	{#if available === false}
		<Callout tone="warning" title="This browser does not offer the tool surface">
			{CHROME_REQUIREMENT}
		</Callout>
	{:else if available === true}
		{#if loading && actions.length === 0}
			<Skeleton variant="row" label="Loading the available actions" />
		{:else if actions.length === 0}
			<EmptyState
				title="No action is available in this tab"
				body="The page registers its tools when it loads. Reload, or open a business record, where the record-specific actions are offered."
				examples={[{ label: 'Open a business record', href: '/b/atl_11bf115c93cd7870' }]}
			/>
		{:else}
			<div class="grid gap-4 lg:grid-cols-12">
				<!-- The list of what can be run, and what running it would do. -->
				<nav
					class="flex flex-col gap-1 lg:sticky lg:top-6 lg:col-span-4 lg:max-h-[80vh] lg:self-start lg:overflow-y-auto"
					aria-label="Available actions"
				>
					{#each actions as action (action.registered.name)}
						<a
							href={`#action-${action.registered.name}`}
							class="flex flex-col gap-1 rounded-md border border-border bg-surface p-3 transition-colors duration-120 hover:border-border-strong hover:bg-panel"
						>
							<span class="flex items-center justify-between gap-2">
								<span class="font-mono text-2xs text-ink">{action.registered.name}</span>
								<span
									class="rounded-md border border-border px-2 py-0.5 text-2xs {action.registered
										.annotations?.readOnlyHint
										? 'bg-panel text-ink-muted'
										: 'bg-accent-tint text-accent-ink'}"
								>
									{action.registered.annotations?.readOnlyHint ? 'read' : 'writes a request'}
								</span>
							</span>
							<span class="line-clamp-2 text-xs text-ink-muted"
								>{action.registered.description}</span
							>
						</a>
					{/each}
				</nav>

				<div class="flex flex-col gap-4 lg:col-span-8">
					{#each actions as action (action.registered.name)}
						<section
							id={`action-${action.registered.name}`}
							class="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
						>
							<div class="flex flex-col gap-1">
								<h2 class="font-mono text-base text-ink">{action.registered.name}</h2>
								<p class="text-base text-ink-muted">{action.registered.description}</p>
								<p class="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
									<span>
										{action.registered.annotations?.readOnlyHint
											? 'Reads the published data'
											: 'Records a request for review'}
									</span>
									<span>
										{action.registered.annotations?.untrustedContentHint
											? 'May include register text'
											: 'No register text in the result'}
									</span>
								</p>
							</div>

							<form class="flex flex-col gap-3" onsubmit={(event) => runAction(event, action)}>
								{#each Object.entries(action.schema.properties) as [name, property] (name)}
									<label class="flex flex-col gap-1">
										<span class="text-xs font-medium text-ink-muted">
											{name}
											{#if action.schema.required.includes(name)}
												<span class="text-error-ink">required</span>
											{/if}
										</span>
										{#if property.description}
											<span class="text-2xs text-ink-muted">{property.description}</span>
										{/if}

										{#if property.enum}
											<select
												{name}
												required={action.schema.required.includes(name)}
												class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
											>
												<option value="">Choose a value</option>
												{#each property.enum as option (String(option))}
													<option value={String(option)}>{String(option)}</option>
												{/each}
											</select>
										{:else if property.type === 'boolean'}
											<input {name} type="checkbox" class="h-4 w-4 rounded border-border" />
										{:else}
											<input
												{name}
												type={property.type === 'number' || property.type === 'integer'
													? 'number'
													: property.format === 'uri'
														? 'url'
														: 'text'}
												required={action.schema.required.includes(name)}
												min={property.minimum}
												max={property.maximum}
												maxlength={property.maxLength}
												step={property.type === 'number' || property.type === 'integer'
													? '1'
													: undefined}
												class="h-10 rounded-md border border-border bg-surface px-3 text-base text-ink transition-colors duration-120 hover:border-border-strong"
											/>
										{/if}
									</label>
								{/each}

								<button
									type="submit"
									disabled={running !== null}
									class="h-10 w-fit rounded-md border border-accent bg-accent px-4 text-base font-medium text-ink transition-colors duration-120 hover:border-accent-ink hover:bg-accent-ink hover:text-canvas"
								>
									{running === action.registered.name ? 'Running' : 'Run this action'}
								</button>
							</form>

							{#if results[action.registered.name]}
								<div class="flex flex-col gap-2">
									<div class="flex flex-wrap items-center justify-between gap-3">
										<p class="text-xs font-medium text-ink-muted">What it returned</p>
										<div class="flex items-center gap-3 text-xs text-ink-muted">
											<span class="tnum">
												{results[action.registered.name].elapsedMs.toFixed(1)} ms
											</span>
											<button
												type="button"
												onclick={() => copyResult(action.registered.name)}
												class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-3 transition-colors duration-120 hover:border-border-strong"
											>
												<Copy size={16} strokeWidth={1.5} aria-hidden="true" />
												{copied === action.registered.name ? 'Copied' : 'Copy'}
											</button>
										</div>
									</div>
									<pre
										class="overflow-x-auto rounded-md border border-border-strong bg-panel-2 p-3 font-mono text-2xs whitespace-pre-wrap text-ink">{results[
											action.registered.name
										].text}</pre>
								</div>
							{/if}
						</section>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<Skeleton variant="row" label="Checking this browser for the tool surface" />
	{/if}
</div>
