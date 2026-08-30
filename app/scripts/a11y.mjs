// A one-off accessibility pass: axe-core is loaded into the page from a CDN rather than added to
// the project, since this is a check we run rather than something the app depends on.
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:5110';
const routes = [
	'/',
	'/search?q=hardware',
	'/explore',
	'/b/atl_11bf115c93cd7870',
	'/b/atl_11bf115c93cd7870/trace/canonical_name',
	'/sources',
	'/methodology',
	'/downloads',
	'/tools',
	'/claim/atl_11bf115c93cd7870'
];
const browser = await chromium.launch();
let total = 0;
for (const width of [1280, 390]) {
	const context = await browser.newContext({ viewport: { width, height: 900 } });
	const page = await context.newPage();
	for (const route of routes) {
		await page.goto(base + route, { waitUntil: 'networkidle' });
		await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js' });
		const result = await page.evaluate(async () => {
			// @ts-expect-error injected
			const run = await axe.run(document, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
			});
			return run.violations.map((v) => ({
				id: v.id,
				impact: v.impact,
				nodes: v.nodes.length,
				target: v.nodes[0]?.target?.join(' ')
			}));
		});
		if (result.length) {
			total += result.length;
			console.log(`\n${width} ${route}`);
			for (const v of result) console.log(`  ${v.impact} ${v.id} (${v.nodes}) ${v.target}`);
		}
	}
	await context.close();
}
await browser.close();
console.log(total === 0 ? '\nno accessibility violations' : `\n${total} violation kinds`);
