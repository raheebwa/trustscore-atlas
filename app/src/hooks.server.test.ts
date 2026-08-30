import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server';

function run(url: string, init: RequestInit = {}, env: Record<string, unknown> = {}) {
	const request = new Request(url, init);
	let resolved = false;
	return Promise.resolve(
		handle({
			event: { request, url: new URL(url), platform: { env } },
			resolve: async () => {
				resolved = true;
				return new Response('page');
			}
		} as never)
	).then((response: Response) => ({ response, resolved }));
}

describe('the maintainer surface guard in the server hook', () => {
	it('refuses every /ops transport without a verified identity, data requests included', async () => {
		for (const path of ['/ops', '/ops/__data.json', '/ops/sources/__data.json', '/ops?/decide']) {
			const { response, resolved } = await run(`https://atlas.example.invalid${path}`, {
				method: path.includes('?/') ? 'POST' : 'GET'
			});
			expect(response.status, path).toBe(403);
			expect(resolved, path).toBe(false);
		}
	});

	it('leaves other routes to the page and API handlers', async () => {
		const { response, resolved } = await run('https://atlas.example.invalid/methodology');
		expect(response.status).toBe(200);
		expect(resolved).toBe(true);
	});
});
