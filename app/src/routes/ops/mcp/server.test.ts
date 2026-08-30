// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET, POST } from './+server';

function database() {
	const calls: { sql: string; bindings: unknown[] }[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...bindings: unknown[]) => ({
				// A prepared statement carries what it was bound with, so a statement that goes into
				// a batch can still be read back by the test.
				sql,
				bindings,
				first: async () => {
					calls.push({ sql, bindings });
					if (sql.includes('FROM meta')) return { value: '20260830T035950Z' };
					if (sql.includes('FROM moderation_decisions')) return null;
					if (sql.includes('FROM claim_evidence')) return { documents: 0 };
					// The claim an approval stands on: verified, at a domain a register published.
					if (sql.includes('verified_at, verified_domain')) {
						return {
							claim_id: 'claim_1',
							atlas_id: 'atlas-1',
							verified_at: '2026-08-30T00:00:00Z',
							verified_domain: 'example.invalid',
							verification_method: 'website_string'
						};
					}
					if (sql.startsWith('SELECT * FROM')) {
						return { status: 'confirmed', atlas_id: 'atlas-1', claim_id: 'claim_1' };
					}
					if (sql.includes('pragma')) return { n: 1 };
					return { n: 0 };
				},
				all: async () => {
					calls.push({ sql, bindings });
					// The website a register published for the record, which is what makes the proven
					// domain approvable without a maintainer vouching for the relationship.
					if (sql.includes('claim_id IN (')) {
						return {
							results: [
								{
									claim_id: 'claim_1',
									atlas_id: 'atlas-1',
									verified_at: '2026-08-30T00:00:00Z',
									verified_domain: 'example.invalid',
									verification_method: 'website_string'
								}
							]
						};
					}
					if (sql.includes('FROM statements')) {
						return { results: [{ atlas_id: 'atlas-1', value: 'https://example.invalid' }] };
					}
					if (sql.includes('FROM claim_evidence')) return { results: [] };
					if (sql.includes('FROM claims')) {
						return {
							results: [
								{
									request_id: 'claim_1',
									atlas_id: 'atlas-1',
									summary: 'owner',
									requested_at: '2026-08-30T01:00:00Z',
									confirmed_at: '2026-08-30T01:05:00Z'
								}
							]
						};
					}
					if (sql.includes('FROM regenerations'))
						return {
							results: [
								{ id: '20260830T035950Z', finished_at: 'x', status: 'live' },
								{ id: '20260830T031131Z', finished_at: 'y', status: 'superseded' }
							]
						};
					return { results: [] };
				},
				run: async () => {
					calls.push({ sql, bindings });
					return { success: true };
				}
			})
		}),
		batch: async (statements: { sql: string; bindings: unknown[] }[]) => {
			calls.push(...statements);
			return [];
		}
	} as unknown as D1Database;
	return { db, calls };
}

async function rpc(body: unknown, identity = true) {
	const { db, calls } = database();
	const request = new Request('https://atlas.example.invalid/ops/mcp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(body)
	});
	const response = await POST({
		platform: {
			env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db, DATA: { head: async () => ({}) } }
		},
		request,
		url: new URL(request.url),
		locals: identity ? { maintainer: 'maintainer@lvh.me' } : {}
	} as never);
	return {
		status: response.status,
		body: (await response.json()) as Record<string, unknown>,
		calls
	};
}

describe('ops MCP endpoint', () => {
	it('lists the maintainer tools: three reads and three actions', async () => {
		const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
		const tools = (body.result as { tools: { name: string }[] }).tools.map((t) => t.name);
		expect(tools).toEqual([
			'list_queue',
			'list_linkage_candidates',
			'list_regenerations',
			'decide_request',
			'label_linkage_pair',
			'request_regeneration'
		]);
	});

	it('reads the queue and records a decision under the verified identity', async () => {
		const queue = await rpc({
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'list_queue', arguments: {} }
		});
		expect(
			JSON.parse((queue.body.result as { content: { text: string }[] }).content[0].text)
		).toMatchObject({ items: [{ request_id: 'claim_1' }] });
		const decided = await rpc({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: {
				name: 'decide_request',
				arguments: {
					request_type: 'claim',
					request_id: 'claim_1',
					decision: 'approved',
					reason: 'Verified by domain.'
				}
			}
		});
		const text = JSON.parse(
			(decided.body.result as { content: { text: string }[] }).content[0].text
		);
		expect(text).toMatchObject({ decision: 'approved', decided_by: 'maintainer@lvh.me' });
		const insert = decided.calls.find((c) => c.sql.includes('INSERT INTO moderation_decisions'));
		expect(insert?.bindings).toContain('maintainer@lvh.me');
	});

	it('refuses without a verified maintainer identity and surfaces ops errors as tool errors', async () => {
		const { status } = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, false);
		expect(status).toBe(403);
		const bad = await rpc({
			jsonrpc: '2.0',
			id: 5,
			method: 'tools/call',
			params: {
				name: 'decide_request',
				arguments: {
					request_type: 'claim',
					request_id: 'claim_1',
					decision: 'approved',
					reason: ' '
				}
			}
		});
		expect((bad.body.result as { isError: boolean }).isError).toBe(true);
		const response = await GET({
			request: new Request('https://atlas.example.invalid/ops/mcp')
		} as never);
		expect(response.status).toBe(405);
	});
});
