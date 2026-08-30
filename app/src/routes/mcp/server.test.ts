// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { GET, POST } from './+server';

function database(): D1Database {
	return {
		prepare: (sql: string) => ({
			bind: () => ({
				first: async () => {
					if (sql.includes('FROM meta')) return { value: 'regen-example-1' };
					if (sql.includes('COUNT(*)')) return { n: 2 };
					if (sql.includes('pragma_table_info')) return { n: 1 };
					return null;
				},
				all: async () => {
					if (sql.includes('DISTINCT country')) return { results: [{ country: 'UG' }] };
					if (sql.includes('GROUP BY district')) return { results: [{ key: 'Kampala', count: 2 }] };
					return { results: [] };
				}
			})
		})
	} as unknown as D1Database;
}

async function rpc(body: unknown) {
	const db = database();
	const request = new Request('https://atlas.example.invalid/mcp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(body)
	});
	const response = await POST({
		platform: { env: { DB: db, DB_STATEMENTS: db, DB_SCORES: db } },
		request,
		url: new URL(request.url)
	} as never);
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('remote MCP endpoint', () => {
	it('answers initialize with tool capability and stateless streamable http', async () => {
		const { status, body } = await rpc({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2025-06-18',
				capabilities: {},
				clientInfo: { name: 'test', version: '0' }
			}
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			jsonrpc: '2.0',
			id: 1,
			result: {
				protocolVersion: '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'trustscore-atlas' }
			}
		});
	});

	it('lists only the read tools', async () => {
		const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
		const tools = (
			body.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }
		).tools;
		expect(tools.map((t) => t.name)).toEqual([
			'search_businesses',
			'get_business',
			'get_evidence',
			'score_business',
			'explain_score',
			'find_segment'
		]);
		expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
	});

	it('runs a read tool and returns MCP text content', async () => {
		const { body } = await rpc({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'find_segment', arguments: { district: 'Kampala' } }
		});
		const result = body.result as { content: { type: string; text: string }[]; isError?: boolean };
		expect(result.isError).toBeFalsy();
		expect(JSON.parse(result.content[0].text)).toMatchObject({ total_count: 2 });
	});

	it('rejects unknown tools, write tools and malformed requests', async () => {
		expect(
			(
				await rpc({
					jsonrpc: '2.0',
					id: 4,
					method: 'tools/call',
					params: { name: 'submit_correction', arguments: {} }
				})
			).body.error
		).toMatchObject({ code: -32602 });
		expect((await rpc({ jsonrpc: '2.0', id: 5, method: 'nope' })).body.error).toMatchObject({
			code: -32601
		});
		expect((await rpc({ hello: 'world' })).body.error).toMatchObject({ code: -32600 });
	});

	it('answers a bare GET with 405 because there is no server-initiated stream', async () => {
		const response = await GET({
			request: new Request('https://atlas.example.invalid/mcp')
		} as never);
		expect(response.status).toBe(405);
	});
});
