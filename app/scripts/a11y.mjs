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
const baseOrigin = new URL(base).origin;

/**
 * A console line from a script this site does not serve is not this site's failure.
 *
 * Console attribution only works against a built page. Under the dev server, Vite's client wraps
 * console messages, so every one of them reports Vite's own URL as its location and nothing is
 * excluded. Run the sweep against a preview or a deployment when the exclusion matters.
 */
function isThirdParty(url) {
	if (!url) return false;
	try {
		return new URL(url).origin !== baseOrigin;
	} catch {
		return false;
	}
}

const browser = await chromium.launch();
let total = 0;
let ourErrors = 0;
for (const width of [1280, 390]) {
	const context = await browser.newContext({ viewport: { width, height: 900 } });
	const page = await context.newPage();
	page.on('console', (message) => {
		if (message.type() !== 'error' || isThirdParty(message.location()?.url)) return;
		ourErrors += 1;
		console.log(`  console error ${message.text()}`);
	});
	for (const route of routes) {
		// Not networkidle: a page carrying the bot-check widget keeps a connection open, so idle
		// never arrives and every route would time out.
		await page.goto(base + route, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(600);
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
console.log(ourErrors === 0 ? 'no console errors from this site' : `${ourErrors} console errors`);
process.exit(total === 0 && ourErrors === 0 ? 0 : 1);
