<script lang="ts">
	import { onMount } from 'svelte';
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

<h1 class="text-2xl font-semibold text-stone-900">Atlas actions</h1>

{#if available === false}
	<p class="mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
		{CHROME_REQUIREMENT}
	</p>
{:else if available === true}
	<p class="mt-2 max-w-2xl text-stone-700">
		Review an available action, enter its details, and run it in this tab.
	</p>

	{#if loading && actions.length === 0}
		<p class="mt-6 text-stone-600">Loading available actions…</p>
	{:else if actions.length === 0}
		<p class="mt-6 text-stone-600">No actions are currently available in this tab.</p>
	{:else}
		<div class="mt-8 space-y-8">
			{#each actions as action (action.registered.name)}
				<section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
					<h2 class="font-mono text-lg font-semibold text-stone-900">
						{action.registered.name}
					</h2>
					<p class="mt-2 text-stone-700">{action.registered.description}</p>

					<dl class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
						<div class="flex gap-2">
							<dt class="font-medium text-stone-800">Read only</dt>
							<dd>{action.registered.annotations?.readOnlyHint ? 'Yes' : 'No'}</dd>
						</div>
						<div class="flex gap-2">
							<dt class="font-medium text-stone-800">Register text</dt>
							<dd>
								{action.registered.annotations?.untrustedContentHint
									? 'May be included'
									: 'Not included'}
							</dd>
						</div>
					</dl>

					<form class="mt-5 space-y-4" onsubmit={(event) => runAction(event, action)}>
						{#each Object.entries(action.schema.properties) as [name, property] (name)}
							<label class="block max-w-2xl">
								<span class="block text-sm font-medium text-stone-800">
									{name}
									{#if action.schema.required.includes(name)}
										<span class="text-red-700"> required</span>
									{/if}
								</span>
								{#if property.description}
									<span class="mt-0.5 block text-sm text-stone-600">{property.description}</span>
								{/if}

								{#if property.enum}
									<select
										{name}
										required={action.schema.required.includes(name)}
										class="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
									>
										<option value="">Choose a value</option>
										{#each property.enum as option (String(option))}
											<option value={String(option)}>{String(option)}</option>
										{/each}
									</select>
								{:else if property.type === 'boolean'}
									<input {name} type="checkbox" class="mt-2 h-4 w-4 rounded border-stone-300" />
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
										class="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"
									/>
								{/if}
							</label>
						{/each}

						<button
							type="submit"
							disabled={running !== null}
							class="rounded-md bg-stone-900 px-5 py-2 font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
						>
							{running === action.registered.name ? 'Running…' : 'Run action'}
						</button>
					</form>

					{#if results[action.registered.name]}
						<div class="mt-6">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<h3 class="font-medium text-stone-900">Result</h3>
								<div class="flex items-center gap-3 text-sm">
									<span class="text-stone-600">
										{results[action.registered.name].elapsedMs.toFixed(1)} ms
									</span>
									<button
										type="button"
										onclick={() => copyResult(action.registered.name)}
										class="rounded border border-stone-300 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-50"
									>
										{copied === action.registered.name ? 'Copied' : 'Copy result'}
									</button>
								</div>
							</div>
							<pre
								class="mt-2 overflow-x-auto rounded-md bg-stone-950 p-4 text-sm whitespace-pre-wrap text-stone-100">{results[
									action.registered.name
								].text}</pre>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
{/if}
