// SPDX-License-Identifier: Apache-2.0
/**
 * Remote MCP server, read-only, over stateless Streamable HTTP: one JSON-RPC request per
 * POST, one JSON response, no server-initiated stream (GET answers 405). The six read tools
 * are the same definitions and result shapes the page registers in the browser.
 */

import { json } from '@sveltejs/kit';
import { explainScore } from '$lib/score-explanation';
import {
	businessExists,
	getBusiness,
	getFieldEvidencePage,
	getJoinedScore,
	getRubricEvidencePage,
	getScore,
	RegenerationInProgressError,
	searchBusinesses
} from '$lib/server/atlas';
import { requireDatabases, type AtlasDatabases } from '$lib/server/platform';
import { findSegment } from '$lib/server/segments';
import {
	EXPLAIN_SCORE_TOOL,
	FIND_SEGMENT_TOOL,
	GET_BUSINESS_TOOL,
	GET_EVIDENCE_TOOL,
	SCORE_BUSINESS_TOOL,
	SEARCH_BUSINESSES_TOOL,
	shapeBusinessRecord,
	shapeEvidenceResults,
	shapeExplanationResult,
	shapeScoreResult,
	shapeSearchResults,
	shapeSegmentResult,
	shapeToolError,
	type ToolTextResult
} from '$lib/webmcp/tools';
import type { RequestHandler } from './$types';

const PROTOCOL_VERSION = '2025-06-18';
const READ_TOOLS = [
	SEARCH_BUSINESSES_TOOL,
	GET_BUSINESS_TOOL,
	GET_EVIDENCE_TOOL,
	SCORE_BUSINESS_TOOL,
	EXPLAIN_SCORE_TOOL,
	FIND_SEGMENT_TOOL
];

type Args = Record<string, unknown>;

function text(value: unknown, max = 200): string | null {
	return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
}

async function runTool(
	databases: AtlasDatabases,
	name: string,
	args: Args
): Promise<ToolTextResult | null> {
	switch (name) {
		case 'search_businesses': {
			const query = text(args.query);
			if (!query) return shapeToolError('invalid_input');
			const limit = typeof args.limit === 'number' ? String(args.limit) : null;
			return shapeSearchResults(
				await searchBusinesses(databases, {
					q: query,
					district: text(args.district),
					limit,
					cursor: text(args.cursor, 2000)
				})
			);
		}
		case 'get_business': {
			const atlasId = text(args.atlas_id);
			if (!atlasId) return shapeToolError('invalid_input');
			const record = await getBusiness(databases, atlasId);
			return record ? shapeBusinessRecord(record) : shapeToolError('business_not_found');
		}
		case 'get_evidence': {
			const atlasId = text(args.atlas_id);
			const field = text(args.field);
			const rubric = text(args.rubric);
			if (!atlasId || (field ? rubric : !rubric)) return shapeToolError('invalid_input');
			if (!(await businessExists(databases.db, atlasId)))
				return shapeToolError('business_not_found');
			const options = {
				limit: typeof args.limit === 'number' ? String(args.limit) : null,
				cursor: text(args.cursor, 2000)
			};
			const evidence = field
				? await getFieldEvidencePage(databases, atlasId, field, options)
				: await getRubricEvidencePage(databases, atlasId, rubric as string, options);
			return evidence ? shapeEvidenceResults(evidence) : shapeToolError('rubric_not_found');
		}
		case 'score_business': {
			const atlasId = text(args.atlas_id);
			const rubric = text(args.rubric, 100);
			if (!atlasId || !rubric) return shapeToolError('invalid_input');
			if (!(await businessExists(databases.db, atlasId)))
				return shapeToolError('business_not_found');
			const score = await getScore(databases, atlasId, rubric, {
				version: typeof args.version === 'number' ? String(args.version) : null
			});
			return score ? shapeScoreResult(score) : shapeToolError('rubric_not_found');
		}
		case 'explain_score': {
			const atlasId = text(args.atlas_id);
			const rubric = text(args.rubric, 100);
			if (!atlasId || !rubric) return shapeToolError('invalid_input');
			if (!(await businessExists(databases.db, atlasId)))
				return shapeToolError('business_not_found');
			const joined = await getJoinedScore(databases, atlasId, rubric);
			if (!joined) return shapeToolError('rubric_not_found');
			return shapeExplanationResult({
				atlas_id: atlasId,
				rubric,
				explanation: explainScore({
					rubric,
					checkable: joined.score.checkable,
					unknown: joined.score.unknown,
					evidence: joined.evidence
				})
			});
		}
		case 'find_segment':
			return shapeSegmentResult(
				await findSegment(databases, {
					category: text(args.category),
					nature: text(args.nature),
					district: text(args.district),
					division: text(args.division),
					present_in: text(args.present_in)
				})
			);
		default:
			return null;
	}
}

const HEADERS = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version'
};

function reply(id: unknown, result: unknown): Response {
	return json({ jsonrpc: '2.0', id: id ?? null, result }, { headers: HEADERS });
}

function failure(id: unknown, code: number, message: string): Response {
	return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { headers: HEADERS });
}

export const POST: RequestHandler = async ({ platform, request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return failure(null, -32700, 'Parse error');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return failure(null, -32600, 'Invalid request');
	}
	const message = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
	if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
		return failure(message.id, -32600, 'Invalid request');
	}
	const params = (
		message.params && typeof message.params === 'object' ? message.params : {}
	) as Args;

	switch (message.method) {
		case 'initialize':
			return reply(message.id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: 'trustscore-atlas', version: '1.0.0' },
				instructions:
					'Read-only tools over public business registers of Uganda and Kenya. Results carry a coverage sentence; scores are not credit or fraud verdicts.'
			});
		case 'notifications/initialized':
			return new Response(null, { status: 202, headers: HEADERS });
		case 'ping':
			return reply(message.id, {});
		case 'tools/list':
			return reply(message.id, { tools: READ_TOOLS });
		case 'tools/call': {
			const name = typeof params.name === 'string' ? params.name : '';
			if (!READ_TOOLS.some((tool) => tool.name === name)) {
				return failure(message.id, -32602, `Unknown tool: ${name || '(none)'}`);
			}
			const args = (
				params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
			) as Args;
			try {
				const result = await runTool(requireDatabases(platform), name, args);
				if (!result) return failure(message.id, -32602, `Unknown tool: ${name}`);
				return reply(message.id, { content: result.content, isError: false });
			} catch (err) {
				if (err instanceof RegenerationInProgressError) {
					return reply(message.id, {
						content: shapeToolError('regeneration_in_progress').content,
						isError: true
					});
				}
				console.error('mcp tool failed', err instanceof Error ? err.message : err);
				return reply(message.id, { content: shapeToolError('tool_failed').content, isError: true });
			}
		}
		default:
			return failure(message.id, -32601, `Method not found: ${message.method}`);
	}
};

export const GET: RequestHandler = async () =>
	new Response('This MCP endpoint is stateless: POST JSON-RPC requests here.', {
		status: 405,
		headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' }
	});

export const OPTIONS: RequestHandler = async () =>
	new Response(null, { status: 204, headers: HEADERS });
