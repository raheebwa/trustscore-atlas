import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseArgument = process.argv[2] ?? 'http://localhost:4173';
let baseUrl;

try {
	baseUrl = new URL(baseArgument);
} catch {
	console.error(`Invalid base URL: ${baseArgument}`);
	process.exit(1);
}

try {
	await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
} catch (error) {
	console.error(`Unable to reach base URL ${baseUrl.href}: ${error.message}`);
	process.exit(1);
}

const routes = [
	'/',
	'/search?q=hardware',
	'/explore',
	'/sources',
	'/methodology',
	'/downloads',
	'/tools',
	'/b/atl_11bf115c93cd7870',
	'/b/atl_11bf115c93cd7870/trace?field=canonical_name',
	'/claim/atl_11bf115c93cd7870'
];
const viewports = [
	{ width: 1280, height: 900 },
	{ width: 390, height: 844 }
];
const baseOrigin = baseUrl.origin;
const results = new Map(
	routes.map((route) => [
		route,
		{ consoleErrors: [], pageErrors: [], failedResponses: [], navigationErrors: [] }
	])
);

function slugFor(route) {
	if (route === '/') return 'home';
	return route
		.replace(/^\//, '')
		.replace(/[^a-zA-Z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
}

let browser;
try {
	browser = await chromium.launch();
} catch (error) {
	console.error(`Unable to launch Playwright Chromium: ${error.message}`);
	process.exit(1);
}

try {
	for (const viewport of viewports) {
		const context = await browser.newContext({ viewport });
		const directory = `data/runs/screens/${viewport.width}`;
		await mkdir(directory, { recursive: true });

		for (const route of routes) {
			const page = await context.newPage();
			const result = results.get(route);
			const label = `${viewport.width}x${viewport.height}`;
			const target = new URL(route, baseUrl);

			page.on('console', (message) => {
				if (message.type() === 'error') {
					result.consoleErrors.push(`${label}: ${message.text()}`);
				}
			});
			page.on('pageerror', (error) => {
				result.pageErrors.push(`${label}: ${error.message}`);
			});
			page.on('response', (response) => {
				const status = response.status();
				if (status < 400) return;
				const responseUrl = new URL(response.url());
				if (responseUrl.origin === baseOrigin) {
					result.failedResponses.push(`${label}: ${status} ${response.url()}`);
				}
			});

			try {
				await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				await page.screenshot({ path: `${directory}/${slugFor(route)}.png`, fullPage: true });
			} catch (error) {
				result.navigationErrors.push(`${label}: ${error.message}`);
			} finally {
				await page.close();
			}
		}

		await context.close();
	}
} finally {
	await browser.close();
}

const failedRoutes = [];
for (const route of routes) {
	const result = results.get(route);
	const issueCount =
		result.consoleErrors.length +
		result.pageErrors.length +
		result.failedResponses.length +
		result.navigationErrors.length;
	console.log(`${issueCount === 0 ? 'PASS' : 'FAIL'} ${route} (${issueCount} issues)`);
	if (issueCount > 0) failedRoutes.push([route, result]);
}

if (failedRoutes.length > 0) {
	console.error('\nRoutes with errors:');
	for (const [route, result] of failedRoutes) {
		console.error(route);
		for (const message of result.consoleErrors) console.error(`  console: ${message}`);
		for (const message of result.pageErrors) console.error(`  page: ${message}`);
		for (const message of result.failedResponses) console.error(`  response: ${message}`);
		for (const message of result.navigationErrors) console.error(`  navigation: ${message}`);
	}
	process.exitCode = 1;
}
