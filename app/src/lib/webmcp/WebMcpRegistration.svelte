<script lang="ts">
	/**
	 * Registers the site's WebMCP tools when the browser exposes the model
	 * context API. Mounted once from src/routes/+layout.svelte.
	 *
	 * API shape (verified against the W3C explainer/spec and Chrome's
	 * developer docs, see src/lib/webmcp/tools.ts for citations):
	 * `document.modelContext.registerTool(tool, { signal })`. Registrations
	 * are torn down on navigation via AbortController and re-registered on
	 * the new page, per docs/ARCHITECTURE.md section 4.1 ("AbortController
	 * per navigation").
	 */
	import { onDestroy, onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import {
		GET_BUSINESS_TOOL,
		SEARCH_BUSINESSES_TOOL,
		shapeBusinessRecord,
		shapeSearchResults,
		shapeToolError,
		type ToolTextResult
	} from './tools';
	import type { BusinessRecordResponse, SearchResponse } from '$lib/types';

	interface ModelContextLike {
		registerTool: (
			tool: Record<string, unknown>,
			options?: { signal?: AbortSignal }
		) => Promise<void>;
	}

	let controller: AbortController | null = null;

	// The current spec and Chrome both expose the API on `document.modelContext`;
	// `navigator.modelContext` is checked too in case a future revision moves it there.
	function modelContext(): ModelContextLike | null {
		if (!browser) return null;
		const fromDocument = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
		if (fromDocument && typeof fromDocument.registerTool === 'function') return fromDocument;
		const fromNavigator = (navigator as unknown as { modelContext?: ModelContextLike })
			.modelContext;
		if (fromNavigator && typeof fromNavigator.registerTool === 'function') return fromNavigator;
		return null;
	}

	async function fetchJson<T>(input: RequestInfo, signal: AbortSignal): Promise<T | null> {
		try {
			const response = await fetch(input, { signal });
			if (!response.ok) return null;
			return (await response.json()) as T;
		} catch {
			return null;
		}
	}

	async function registerTools() {
		const mc = modelContext();
		if (!mc) return;

		controller = new AbortController();
		const { signal } = controller;

		try {
			await mc.registerTool(
				{
					...SEARCH_BUSINESSES_TOOL,
					async execute(
						input: { query: string; district?: string; limit?: number; cursor?: string },
						options?: { signal?: AbortSignal }
					): Promise<ToolTextResult> {
						const queryParts = [`q=${encodeURIComponent(input.query)}`];
						if (input.district) {
							queryParts.push(`district=${encodeURIComponent(input.district)}`);
						}
						if (input.limit) queryParts.push(`limit=${encodeURIComponent(String(input.limit))}`);
						if (input.cursor) queryParts.push(`cursor=${encodeURIComponent(input.cursor)}`);
						const data = await fetchJson<SearchResponse>(
							`/api/v1/businesses?${queryParts.join('&')}`,
							options?.signal ?? signal
						);
						if (!data) {
							return shapeToolError('search_failed');
						}
						return shapeSearchResults(data);
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...GET_BUSINESS_TOOL,
					async execute(
						input: { atlas_id: string },
						options?: { signal?: AbortSignal }
					): Promise<ToolTextResult> {
						const data = await fetchJson<BusinessRecordResponse>(
							`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}`,
							options?.signal ?? signal
						);
						if (!data) {
							return shapeToolError('business_not_found');
						}
						return shapeBusinessRecord(data);
					}
				},
				{ signal }
			);
		} catch {
			// Registration can reject (NotAllowedError under a tools permission
			// policy, or a duplicate name); the page still works without tools.
		}
	}

	function unregisterTools() {
		controller?.abort();
		controller = null;
	}

	onMount(() => {
		void registerTools();
	});

	afterNavigate(() => {
		unregisterTools();
		void registerTools();
	});

	onDestroy(() => {
		unregisterTools();
	});
</script>
