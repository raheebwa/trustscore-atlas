// SPDX-License-Identifier: Apache-2.0
/**
 * Ops MCP server: the maintainer actions over the same ops library as the /ops screens, behind
 * the same Cloudflare Access check (the server hook verifies the JWT for every /ops path and
 * records the identity in locals). Stateless Streamable HTTP like /mcp: one JSON-RPC request
 * per POST, JSON response, GET answers 405.
 */

import { json } from '@sveltejs/kit';
import { listReviewCandidates, recordMaintainerLabel } from '$lib/server/linkage-review';
import { approvalGate, decideRequest, listQueue, OpsError, REQUEST_TYPES } from '$lib/server/ops';
import type { ModerationRequestType } from '$lib/server/ops';
import { getDatabase, requireBucket } from '$lib/server/platform';
import {
	listRegenerations,
	listRequests,
	requestRegeneration
} from '$lib/server/regeneration-requests';
import type { RequestHandler } from './$types';

const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
	{
		name: 'list_queue',
		description:
			'Confirmed claims, corrections, linkage labels and issues awaiting a maintainer decision, oldest first.',
		inputSchema: { type: 'object', properties: {}, required: [] },
		annotations: { readOnlyHint: true }
	},
	{
		name: 'list_linkage_candidates',
		description:
			'Name candidates in the 0.80 to 0.95 review band without a maintainer verdict, both businesses side by side.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } },
			required: []
		},
		annotations: { readOnlyHint: true }
	},
	{
		name: 'list_regenerations',
		description:
			'The live regeneration, the earlier ones a rollback can target, and recent requests.',
		inputSchema: { type: 'object', properties: {}, required: [] },
		annotations: { readOnlyHint: true }
	},
	{
		name: 'decide_request',
		description:
			'Approve or reject one confirmed request with a reason. One decision per request, append-only, never edits the request. Approving a claim, or a correction filed from one, needs the claim verified; when no register published the proven domain, it also needs a person to have checked what connects that domain to the business.',
		inputSchema: {
			type: 'object',
			properties: {
				request_type: { type: 'string', enum: [...REQUEST_TYPES] },
				request_id: { type: 'string', maxLength: 200 },
				decision: { type: 'string', enum: ['approved', 'rejected'] },
				reason: { type: 'string', maxLength: 500 },
				domain_relationship_reviewed: {
					type: 'boolean',
					description:
						'Set only when a person has checked what connects the proven domain to this business, and the reason names that evidence. It is recorded with the decision as the basis for approving.'
				}
			},
			required: ['request_type', 'request_id', 'decision', 'reason']
		},
		annotations: { readOnlyHint: false }
	},
	{
		name: 'label_linkage_pair',
		description:
			'Record a match or non_match verdict for two businesses with a reason; compiled into the labels file at the next regeneration.',
		inputSchema: {
			type: 'object',
			properties: {
				atlas_id: { type: 'string', maxLength: 200 },
				candidate_atlas_id: { type: 'string', maxLength: 200 },
				verdict: { type: 'string', enum: ['match', 'non_match'] },
				reason: { type: 'string', maxLength: 500 }
			},
			required: ['atlas_id', 'candidate_atlas_id', 'verdict', 'reason']
		},
		annotations: { readOnlyHint: false }
	},
	{
		name: 'request_regeneration',
		description:
			'Request a regeneration now, or a rollback to an earlier regeneration whose SQL and bundle are still in the bucket. The refresh workflow carries it out.',
		inputSchema: {
			type: 'object',
			properties: {
				kind: { type: 'string', enum: ['regenerate', 'rollback'] },
				target_id: { type: 'string', maxLength: 40 },
				reason: { type: 'string', maxLength: 500 }
			},
			required: ['kind', 'reason']
		},
		annotations: { readOnlyHint: false }
	}
] as const;

type Args = Record<string, unknown>;

function text(value: unknown, max = 200): string {
	return typeof value === 'string' && value.length <= max ? value : '';
}

async function runTool(
	platform: App.Platform | undefined,
	maintainer: string,
	name: string,
	args: Args
): Promise<unknown> {
	const db = getDatabase(platform, 'ops');
	const statementsDb = getDatabase(platform, 'statements');
	switch (name) {
		case 'list_queue': {
			// The queue carries the same gate the decision applies, so an agent is not left to
			// re-derive it and press a button that is always refused.
			const items = await listQueue(db, statementsDb);
			return { items: items.map((item) => ({ ...item, gate: approvalGate(item) })) };
		}
		case 'list_linkage_candidates':
			return {
				candidates: await listReviewCandidates(
					db,
					typeof args.limit === 'number' ? Math.min(200, Math.max(1, args.limit)) : undefined
				)
			};
		case 'list_regenerations': {
			const [regenerations, requests] = await Promise.all([
				listRegenerations(db),
				listRequests(db)
			]);
			return { ...regenerations, requests };
		}
		case 'decide_request': {
			const requestType = text(args.request_type);
			if (!REQUEST_TYPES.includes(requestType as ModerationRequestType)) {
				throw new OpsError('Unknown request type.');
			}
			const decision = text(args.decision);
			if (decision !== 'approved' && decision !== 'rejected') {
				throw new OpsError('Decision must be approved or rejected.');
			}
			return decideRequest(db, statementsDb, {
				request_type: requestType as ModerationRequestType,
				request_id: text(args.request_id),
				decision,
				reason: text(args.reason, 500),
				decided_by: maintainer,
				domain_relationship_reviewed: args.domain_relationship_reviewed === true
			});
		}
		case 'label_linkage_pair': {
			const verdict = text(args.verdict);
			if (verdict !== 'match' && verdict !== 'non_match') {
				throw new OpsError('Verdict must be match or non_match.');
			}
			return recordMaintainerLabel(db, {
				atlas_id: text(args.atlas_id),
				candidate_atlas_id: text(args.candidate_atlas_id),
				verdict,
				reason: text(args.reason, 500),
				labelled_by: maintainer
			});
		}
		case 'request_regeneration': {
			const kind = text(args.kind);
			if (kind !== 'regenerate' && kind !== 'rollback') throw new OpsError('Unknown request kind.');
			return requestRegeneration(
				db,
				{
					kind,
					target_id: text(args.target_id, 40) || null,
					reason: text(args.reason, 500),
					requested_by: maintainer
				},
				requireBucket(platform)
			);
		}
		default:
			return null;
	}
}

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function reply(id: unknown, result: unknown): Response {
	return json({ jsonrpc: '2.0', id: id ?? null, result }, { headers: HEADERS });
}

function failure(id: unknown, code: number, message: string): Response {
	return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { headers: HEADERS });
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
	const maintainer = (locals as { maintainer?: string }).maintainer;
	if (!maintainer) {
		return json({ error: 'Maintainer access required.' }, { status: 403, headers: HEADERS });
	}
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
				serverInfo: { name: 'trustscore-atlas-ops', version: '1.0.0' },
				instructions: `Maintainer tools for ${maintainer}. Every action is recorded under this identity and is append-only.`
			});
		case 'notifications/initialized':
			return new Response(null, { status: 202, headers: HEADERS });
		case 'ping':
			return reply(message.id, {});
		case 'tools/list':
			return reply(message.id, { tools: TOOLS });
		case 'tools/call': {
			const name = typeof params.name === 'string' ? params.name : '';
			if (!TOOLS.some((tool) => tool.name === name)) {
				return failure(message.id, -32602, `Unknown tool: ${name || '(none)'}`);
			}
			const args = (
				params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
			) as Args;
			try {
				const result = await runTool(platform, maintainer, name, args);
				return reply(message.id, {
					content: [{ type: 'text', text: JSON.stringify(result) }],
					isError: false
				});
			} catch (err) {
				if (err instanceof OpsError) {
					return reply(message.id, {
						content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
						isError: true
					});
				}
				console.error('ops mcp tool failed', err instanceof Error ? err.message : err);
				return reply(message.id, {
					content: [{ type: 'text', text: JSON.stringify({ error: 'tool_failed' }) }],
					isError: true
				});
			}
		}
		default:
			return failure(message.id, -32601, `Method not found: ${message.method}`);
	}
};

export const GET: RequestHandler = async () =>
	new Response('This MCP endpoint is stateless: POST JSON-RPC requests here.', {
		status: 405,
		headers: { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' }
	});
