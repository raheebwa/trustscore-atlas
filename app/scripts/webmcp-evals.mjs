// WebMCP evals against a deployed or local atlas.
// Prerequisites: Chrome 152 or later started with --enable-features=WebMCP --remote-debugging-port=9333
// and a tab open on the site. Usage: node app/scripts/webmcp-evals.mjs <base-url> <out.md>
// The runner navigates, reads document.modelContext.getTools(), calls executeTool with real inputs,
// captures page exceptions and console errors, and writes a markdown table.
const [base, out] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page =
	targets.find((t) => t.type === 'page' && t.url.startsWith(base)) ??
	targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
let pageErrors = [];
ws.addEventListener('message', (e) => {
	const m = JSON.parse(e.data);
	if (m.method === 'Runtime.exceptionThrown')
		pageErrors.push(
			String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
				.split('\n')[0]
				.slice(0, 160)
		);
	if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
		pageErrors.push(
			'console.error ' +
				m.params.args
					.map((a) => a.value ?? a.description)
					.join(' ')
					.slice(0, 160)
		);
});
const call = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const mid = ++id;
		const onMessage = (event) => {
			const msg = JSON.parse(event.data);
			if (msg.id !== mid) return;
			ws.removeEventListener('message', onMessage);
			if (msg.error) reject(new Error(JSON.stringify(msg.error)));
			else resolve(msg.result);
		};
		ws.addEventListener('message', onMessage);
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
const evaluate = async (expression) => {
	const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails)
		throw new Error(
			r.exceptionDetails.text +
				' ' +
				JSON.stringify(r.exceptionDetails.exception?.description ?? '')
		);
	return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await call('Runtime.enable');
async function open(path, expectedTools) {
	pageErrors = [];
	await call('Page.navigate', { url: base + path });
	const started = Date.now();
	while (Date.now() - started < 20000) {
		await sleep(300);
		try {
			const names = await evaluate(
				'(async () => JSON.stringify((await document.modelContext.getTools()).map(t => t.name).sort()))()'
			);
			const list = JSON.parse(names);
			if (expectedTools.every((n) => list.includes(n))) return list;
		} catch {
			/* page still loading */
		}
	}
	return JSON.parse(
		await evaluate(
			'(async () => JSON.stringify((await document.modelContext.getTools()).map(t => t.name).sort()))()'
		)
	);
}
async function exec(tool, args) {
	const started = Date.now();
	const raw = await evaluate(
		`(async () => { const tools = await document.modelContext.getTools(); const tool = tools.find(t => t.name === ${JSON.stringify(tool)}); if (!tool) return JSON.stringify({error: 'tool not registered'}); const r = await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(args))}); return typeof r === 'string' ? r : JSON.stringify(r); })()`
	);
	const ms = Date.now() - started;
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = { raw };
	}
	// Tool results arrive as MCP content: {content:[{type:'text', text: '<json>'}]}
	if (parsed && Array.isArray(parsed.content) && parsed.content[0]?.type === 'text') {
		try {
			parsed = JSON.parse(parsed.content[0].text);
		} catch {
			parsed = { text: parsed.content[0].text };
		}
	}
	return { parsed, ms, bytes: raw.length };
}

const BANK = 'atl_6307e13f9040f449'; // Citibank Uganda: KCCA, BoU, URA VAT
const cases = [
	{
		path: '/search?q=citibank',
		tools: ['search_businesses'],
		tool: 'search_businesses',
		args: { query: 'CITIBANK UGANDA LIMITED' },
		check: (r) =>
			r.results?.some((x) => x.atlas_id === BANK)
				? `bank found (returned ${r.returned} of ${r.total_count})`
				: 'bank missing: ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: '/search',
		tools: ['find_segment'],
		tool: 'find_segment',
		args: { district: 'Kampala', category: 'GENERAL' },
		check: (r) =>
			r.total_count > 1000
				? `total ${r.total_count}, ${r.counts_by_division?.length} divisions, top ${JSON.stringify(r.counts_by_division?.[0])}`
				: 'unexpected ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: `/b/${BANK}`,
		tools: ['get_business'],
		tool: 'get_business',
		args: { atlas_id: BANK },
		check: (r) =>
			r.canonical_name && r.coverage?.summary
				? `${r.canonical_name}; ${r.coverage.summary}; ${r.identifiers?.length ?? 0} identifiers; truncated=${r.truncated}`
				: 'missing record ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: `/b/${BANK}`,
		tools: ['get_evidence'],
		tool: 'get_evidence',
		args: { atlas_id: BANK, field: 'canonical_name' },
		check: (r) =>
			(r.returned ?? r.statements?.length ?? 0) > 0
				? `${r.returned ?? r.statements.length} statements returned`
				: 'none ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: `/b/${BANK}`,
		tools: ['score_business'],
		tool: 'score_business',
		args: { atlas_id: BANK, rubric: 'formality' },
		check: (r) =>
			typeof (r.value ?? r.score?.value) === 'number'
				? `formality ${r.value ?? r.score.value}/${r.max ?? r.score.max}`
				: 'no value ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: `/b/${BANK}`,
		tools: ['explain_score'],
		tool: 'explain_score',
		args: { atlas_id: BANK, rubric: 'formality' },
		check: (r) =>
			(r.explanation ?? r.summary ?? r.lines)
				? 'explanation present'
				: 'missing ' + JSON.stringify(r).slice(0, 200)
	},
	{
		path: `/b/${BANK}`,
		tools: ['get_business'],
		tool: 'get_business',
		args: { atlas_id: 'atl_does_not_exist' },
		check: (r) =>
			r.error
				? `error surfaced: ${r.error}`
				: 'no error for unknown id ' + JSON.stringify(r).slice(0, 120)
	},
	{ path: '/tools', tools: [], tool: null, args: null, check: () => 'listed' },
	...[
		'atl_11bf115c93cd7870',
		'atl_6307e13f9040f449',
		'atl_10fb3cc81e7a1a4f',
		'atl_0334897f83a73044',
		'atl_11ae4807eaee3b9c'
	].map((atlasId) => ({
		path: `/b/${atlasId}`,
		tools: ['get_evidence'],
		tool: null,
		args: null,
		demo: true,
		check: () => 'demo page'
	}))
];
const rows = [];
for (const c of cases) {
	const list = await open(c.path, c.tools);
	if (!c.tool) {
		const errors = [...pageErrors];
		const verdict = c.demo
			? `${list.length} tools, ${errors.length} page errors${errors.length ? ': ' + errors.join(' | ') : ''}`
			: 'tools: ' + list.join(', ');
		rows.push({
			...c,
			tools_seen: list,
			verdict,
			ms: 0,
			bytes: 0,
			ok: c.demo ? list.length === 9 && errors.length === 0 : true
		});
		continue;
	}
	try {
		const { parsed, ms, bytes } = await exec(c.tool, c.args);
		rows.push({
			...c,
			tools_seen: list,
			verdict: c.check(parsed),
			ms,
			bytes,
			ok: !String(c.check(parsed)).match(/missing|unexpected|none|no value|no error|coverage/)
		});
	} catch (e) {
		rows.push({
			...c,
			tools_seen: list,
			verdict: 'THREW ' + e.message.slice(0, 200),
			ms: 0,
			bytes: 0,
			ok: false
		});
	}
}
ws.close();
const md = [
	`# WebMCP evals: ${base}`,
	``,
	`Run ${new Date().toISOString()} in Chrome via CDP (document.modelContext.getTools / executeTool).`,
	``,
	`| page | tool | input | result | ms | bytes |`,
	`|---|---|---|---|---|---|`,
	...rows.map(
		(r) =>
			`| ${r.path} | ${r.tool ?? '(list)'} | ${r.args ? JSON.stringify(r.args) : ''} | ${r.verdict} | ${r.ms} | ${r.bytes} |`
	),
	``,
	`Tools seen per page: ${[...new Set(rows.map((r) => `${r.path.split('?')[0]}: ${r.tools_seen.join(', ')}`))].join('; ')}`,
	``
].join('\n');
await (await import('node:fs/promises')).writeFile(out, md);
console.log(md);
