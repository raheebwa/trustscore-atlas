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

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// scripts/ lives inside app/, and the repository's data directory is its sibling's parent.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const routeSpecs = [
	'/',
	'/search',
	'/search?q=hardware',
	'/search?q=hardware&district=KAMPALA',
	'/search?q=nothingmatchesthisname',
	'/search?q=bank&district=Kampala%20District',
	'/explore',
	'/explore?district=KAMPALA',
	'/explore?country=KE',
	'/sources',
	'/methodology',
	'/downloads',
	'/tools',
	'/b/atl_11bf115c93cd7870',
	'/b/atl_6307e13f9040f449',
	'/b/atl_11bf115c93cd7870/trace/canonical_name',
	{ route: '/b/atl_does_not_exist', expect: 404 },
	'/claim/atl_11bf115c93cd7870',
	'/claim/atl_11bf115c93cd7870?token=not-a-real-token',
	'/claim/verify/chal_does_not_exist?token=not-a-real-token',
	'/report/issue_does_not_exist?token=not-a-real-token',
	'/correct/correction_does_not_exist?token=not-a-real-token',
	'/label/label_does_not_exist?token=not-a-real-token',
	{ route: '/ops', expect: 403 },
	{ route: '/not-a-route', expect: 404 }
];

// A route may declare the status it is meant to answer with, so an error page can be swept for
// how it reads without the sweep calling its own status a failure.
const routes = routeSpecs.map((spec) => (typeof spec === 'string' ? spec : spec.route));
const expectedStatus = new Map(
	routeSpecs.filter((spec) => typeof spec !== 'string').map((spec) => [spec.route, spec.expect])
);
const viewports = [
	{ width: 1280, height: 900 },
	{ width: 390, height: 844 }
];
const baseOrigin = baseUrl.origin;
const results = new Map(
	routes.map((route) => [
		route,
		{
			consoleErrors: [],
			pageErrors: [],
			failedResponses: [],
			navigationErrors: [],
			rawTimestamps: []
		}
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
		const directory = path.join(REPO_ROOT, 'data', 'runs', 'screens', String(viewport.width));
		await mkdir(directory, { recursive: true });

		for (const route of routes) {
			const page = await context.newPage();
			const result = results.get(route);
			const label = `${viewport.width}x${viewport.height}`;
			const target = new URL(route, baseUrl);

			// A route that exists to show an error answers with one: the sweep still checks how it
			// reads, it just does not call the expected status a failure.
			const allowedStatus = expectedStatus.get(route);

			page.on('console', (message) => {
				const text = message.text();
				const echoesExpectedStatus =
					allowedStatus !== undefined && text.includes(`status of ${allowedStatus}`);
				if (message.type() === 'error' && !echoesExpectedStatus) {
					result.consoleErrors.push(`${label}: ${text}`);
				}
			});
			page.on('pageerror', (error) => {
				result.pageErrors.push(`${label}: ${error.message}`);
			});
			page.on('response', (response) => {
				const status = response.status();
				if (status < 400 || status === allowedStatus) return;
				const responseUrl = new URL(response.url());
				if (responseUrl.origin === baseOrigin) {
					result.failedResponses.push(`${label}: ${status} ${response.url()}`);
				}
			});

			try {
				await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
				await page.screenshot({ path: `${directory}/${slugFor(route)}.png`, fullPage: true });
				// A machine timestamp is not a sentence. This reads the text a person actually sees,
				// not the serialised page data or a title attribute, both of which carry ISO values
				// on purpose.
				const rendered = await page.evaluate(() => document.body.innerText);
				for (const stamp of rendered.match(/T\d\d:\d\d:\d\d\.\d+Z/g) ?? []) {
					result.rawTimestamps.push(`${label}: ${stamp}`);
				}
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
		result.navigationErrors.length +
		result.rawTimestamps.length;
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
		for (const message of result.rawTimestamps) console.error(`  raw timestamp: ${message}`);
	}
	process.exitCode = 1;
}
