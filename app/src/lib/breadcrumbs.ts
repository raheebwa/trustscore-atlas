// SPDX-License-Identifier: Apache-2.0
/**
 * Where a page sits, built from the route and the data it loaded rather than written by hand on
 * each page, so the trail cannot drift from the navigation.
 *
 * Every crumb keeps the country in scope and drops page state: a reader following a crumb back to
 * Search wants the section, not their previous query, and a crumb that carried a stale filter
 * would be a trap. The current page is the last crumb and is never a link.
 */

export interface Crumb {
	label: string;
	/** Absent on the current page, which is text rather than a link. */
	href?: string;
	/** The full value when the label had to be truncated, or the filters behind a query. */
	title?: string;
}

export interface CrumbContext {
	pathname: string;
	country: string;
	countryName: string;
	/** The business a record, trace, claim or confirmation page is about. */
	recordName?: string | null;
	recordId?: string | null;
	/** The field a trace page traces. */
	fieldLabel?: string | null;
	/** The query a search page ran, and the filters it ran with. */
	query?: string | null;
	filters?: Record<string, string | null | undefined>;
	/** The area an explorer page is filtered to. */
	area?: string | null;
	/** The section anchor a long prose page is scrolled to. */
	anchor?: string | null;
}

const MAX_LABEL = 42;

const SECTIONS: Record<string, string> = {
	search: 'Search',
	explore: 'Explore',
	sources: 'Sources',
	methodology: 'Methodology',
	downloads: 'Downloads',
	tools: 'Actions',
	claim: 'Claim',
	report: 'Report',
	correct: 'Correction',
	label: 'Linkage label',
	b: 'Record'
};

/** Sections that belong to no country: the tool surface is the same for every pack. */
const GLOBAL_SECTIONS = new Set(['tools']);

/** Sections that are about one business, and therefore sit under it. */
const RECORD_SECTIONS = new Set(['claim', 'report', 'correct', 'label']);

function truncate(label: string): { label: string; title?: string } {
	if (label.length <= MAX_LABEL) return { label };
	return { label: `${label.slice(0, MAX_LABEL - 1).trimEnd()}…`, title: label };
}

function scoped(path: string, country: string): string {
	return `${path}?country=${encodeURIComponent(country)}`;
}

function filterTitle(filters: CrumbContext['filters']): string | undefined {
	const applied = Object.entries(filters ?? {})
		.filter(([, value]) => Boolean(value))
		.map(([key, value]) => `${key}: ${value}`);
	return applied.length > 0 ? applied.join(', ') : undefined;
}

export function buildCrumbs(context: CrumbContext): Crumb[] {
	const segments = context.pathname.split('/').filter(Boolean);
	if (segments.length === 0) return [];

	const [head] = segments;
	const crumbs: Crumb[] = [{ label: 'Home', href: scoped('/', context.country) }];

	if (!GLOBAL_SECTIONS.has(head)) {
		crumbs.push({ label: context.countryName, href: scoped('/', context.country) });
	}

	if (head === 'b') {
		// A record is the thing itself: it takes its own crumb rather than sitting under "Record".
		const name = context.recordName ?? context.recordId ?? 'Record';
		const recordHref = context.recordId ? `/b/${encodeURIComponent(context.recordId)}` : undefined;
		const isRecordPage = segments.length === 2;
		crumbs.push({
			...truncate(name),
			href: isRecordPage ? undefined : recordHref
		});
		if (segments[2] === 'trace') {
			crumbs.push(truncate(context.fieldLabel ?? 'Trace'));
		}
		return crumbs;
	}

	const section = SECTIONS[head] ?? head;
	const sectionHref = GLOBAL_SECTIONS.has(head) ? `/${head}` : scoped(`/${head}`, context.country);

	// A page about one business sits under that business, not under the action: someone reading a
	// claim page wants one step back to the record, not to a list of claims that does not exist.
	if (RECORD_SECTIONS.has(head) && context.recordName) {
		crumbs.push({
			...truncate(context.recordName),
			href: context.recordId ? `/b/${encodeURIComponent(context.recordId)}` : undefined
		});
		crumbs.push({ label: section });
		return crumbs;
	}

	const leaf = leafFor(head, context);
	crumbs.push(leaf ? { label: section, href: sectionHref } : { label: section });
	if (leaf) crumbs.push(leaf);
	return crumbs;
}

function leafFor(head: string, context: CrumbContext): Crumb | null {
	if (head === 'search' && context.query) {
		return { ...truncate(`"${context.query}"`), title: filterTitle(context.filters) };
	}
	if (head === 'explore' && context.area) return truncate(context.area);
	if (head === 'methodology' && context.anchor) return truncate(context.anchor);
	return null;
}

/**
 * The same trail as schema.org, so a crawler and a reader are told the same thing.
 *
 * Every "<" is escaped as \u003c, which JSON readers decode identically, so a business name
 * containing a closing script tag cannot end the block it is embedded in. That is what makes it
 * safe to write this into the document as raw text.
 */
export function breadcrumbJsonLd(crumbs: Crumb[], origin: string): string {
	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: crumbs.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.title ?? crumb.label,
			...(crumb.href ? { item: `${origin}${crumb.href}` } : {})
		}))
	}).replaceAll('<', '\\u003c');
}
