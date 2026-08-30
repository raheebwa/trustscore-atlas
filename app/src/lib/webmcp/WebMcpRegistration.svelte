<script lang="ts">
	/** Registers the page surface and tears every registration down on navigation. */
	import { onDestroy, onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import {
		EXPLAIN_SCORE_TOOL,
		FIND_SEGMENT_TOOL,
		GET_BUSINESS_TOOL,
		GET_EVIDENCE_TOOL,
		LABEL_LINKAGE_TOOL,
		REPORT_ISSUE_TOOL,
		SCORE_BUSINESS_TOOL,
		SEARCH_BUSINESSES_TOOL,
		START_CLAIM_TOOL,
		SUBMIT_CORRECTION_TOOL,
		executeLabelLinkage,
		executeReportIssue,
		executeStartClaim,
		executeSubmitCorrection,
		shapeBusinessRecord,
		shapeEvidenceResults,
		shapeExplanationResult,
		shapeHttpToolError,
		shapeScoreResult,
		shapeSearchResults,
		shapeSegmentResult,
		shapeToolError,
		type ToolTextResult
	} from './tools';
	import type {
		BusinessRecordResponse,
		EvidenceResponse,
		ScoreExplanationResponse,
		ScoreSummary,
		SearchResponse,
		SegmentResponse
	} from '$lib/types';
	import type { CorrectionInput, IssueInput, LinkageLabelInput } from '$lib/write-requests';

	interface ModelContextLike {
		registerTool: (
			tool: Record<string, unknown>,
			options?: { signal?: AbortSignal }
		) => Promise<void>;
	}

	interface ToolExecutionContext {
		signal?: AbortSignal;
		requestUserInteraction?: <T>(callback: () => T | Promise<T>) => Promise<T>;
	}

	interface FetchResult<T> {
		data: T | null;
		status: number;
	}

	let controller: AbortController | null = null;

	function modelContext(): ModelContextLike | null {
		if (!browser) return null;
		const fromDocument = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
		if (fromDocument && typeof fromDocument.registerTool === 'function') return fromDocument;
		const fromNavigator = (navigator as unknown as { modelContext?: ModelContextLike })
			.modelContext;
		if (fromNavigator && typeof fromNavigator.registerTool === 'function') return fromNavigator;
		return null;
	}

	async function fetchJson<T>(input: RequestInfo, init: RequestInit = {}): Promise<FetchResult<T>> {
		try {
			const response = await fetch(input, init);
			if (!response.ok) return { data: null, status: response.status };
			return { data: (await response.json()) as T, status: response.status };
		} catch {
			return { data: null, status: 0 };
		}
	}

	function queryString(values: Record<string, string | number | undefined>): string {
		return Object.entries(values)
			.filter(
				(entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ''
			)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
			.join('&');
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
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						const query = queryString({
							q: input.query,
							district: input.district,
							limit: input.limit,
							cursor: input.cursor
						});
						const result = await fetchJson<SearchResponse>(`/api/v1/businesses?${query}`, {
							signal: context?.signal ?? signal
						});
						return result.data ? shapeSearchResults(result.data) : shapeToolError('search_failed');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...GET_BUSINESS_TOOL,
					async execute(
						input: { atlas_id: string },
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						const result = await fetchJson<BusinessRecordResponse>(
							`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}`,
							{ signal: context?.signal ?? signal }
						);
						return result.data
							? shapeBusinessRecord(result.data)
							: shapeToolError('business_not_found');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...GET_EVIDENCE_TOOL,
					async execute(
						input: {
							atlas_id: string;
							field?: string;
							rubric?: string;
							cursor?: string;
						},
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						if (Boolean(input.field) === Boolean(input.rubric)) {
							return shapeToolError('provide_exactly_one_of_field_or_rubric');
						}
						const query = queryString({
							field: input.field,
							rubric: input.rubric,
							limit: 1,
							cursor: input.cursor
						});
						const result = await fetchJson<EvidenceResponse>(
							`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}/evidence?${query}`,
							{ signal: context?.signal ?? signal }
						);
						if (result.status === 404) return shapeHttpToolError('evidence_not_found', 404);
						return result.data
							? shapeEvidenceResults(result.data)
							: shapeToolError('evidence_lookup_failed');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...SCORE_BUSINESS_TOOL,
					async execute(
						input: { atlas_id: string; rubric: string; version?: number },
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						const query = queryString({ rubric: input.rubric, version: input.version });
						const result = await fetchJson<ScoreSummary>(
							`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}/scores?${query}`,
							{ signal: context?.signal ?? signal }
						);
						if (result.status === 404) return shapeHttpToolError('rubric_not_found', 404);
						return result.data
							? shapeScoreResult(result.data)
							: shapeToolError('score_lookup_failed');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...EXPLAIN_SCORE_TOOL,
					async execute(
						input: { atlas_id: string; rubric: string },
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						const query = queryString({ rubric: input.rubric });
						const result = await fetchJson<ScoreExplanationResponse>(
							`/api/v1/businesses/${encodeURIComponent(input.atlas_id)}/explanation?${query}`,
							{ signal: context?.signal ?? signal }
						);
						if (result.status === 404) return shapeHttpToolError('rubric_not_found', 404);
						return result.data
							? shapeExplanationResult(result.data)
							: shapeToolError('explanation_failed');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...FIND_SEGMENT_TOOL,
					async execute(
						input: {
							category?: string;
							nature?: string;
							district?: string;
							division?: string;
							present_in?: string;
						},
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						const query = queryString(input);
						const result = await fetchJson<SegmentResponse>(`/api/v1/segments?${query}`, {
							signal: context?.signal ?? signal
						});
						return result.data
							? shapeSegmentResult(result.data)
							: shapeToolError('segment_lookup_failed');
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...START_CLAIM_TOOL,
					async execute(
						input: { atlas_id: string; claimant_role: string },
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						return executeStartClaim(input, context, {
							fetchJson,
							confirm: (message) => window.confirm(message),
							signal
						});
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...SUBMIT_CORRECTION_TOOL,
					async execute(
						input: CorrectionInput,
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						return executeSubmitCorrection(input, context, {
							fetchJson,
							confirm: (message) => window.confirm(message),
							signal
						});
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...LABEL_LINKAGE_TOOL,
					async execute(
						input: LinkageLabelInput,
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						return executeLabelLinkage(input, context, {
							fetchJson,
							confirm: (message) => window.confirm(message),
							signal
						});
					}
				},
				{ signal }
			);

			await mc.registerTool(
				{
					...REPORT_ISSUE_TOOL,
					async execute(
						input: IssueInput,
						context?: ToolExecutionContext
					): Promise<ToolTextResult> {
						return executeReportIssue(input, context, {
							fetchJson,
							confirm: (message) => window.confirm(message),
							signal
						});
					}
				},
				{ signal }
			);
		} catch {
			// Registration may be unavailable or denied. The page remains usable.
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
