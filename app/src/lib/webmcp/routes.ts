// SPDX-License-Identifier: Apache-2.0
/**
 * Route-aware tool sets: each page registers only the tools that make sense there, and the
 * business page scopes record tools to the record on screen. Registrations are torn down and
 * rebuilt on navigation, which fires the browser's toolchange event.
 */

interface ScopableProperty {
	readonly description?: string;
	readonly [key: string]: unknown;
}

interface ScopableSchema {
	readonly type: 'object';
	readonly properties: Readonly<Record<string, ScopableProperty>>;
	readonly required?: readonly string[];
}

export interface RouteTools {
	names: string[];
	atlasId: string | null;
}

const EVERYWHERE = ['search_businesses', 'get_business', 'report_issue'];
const ALL_TOOLS = [
	'search_businesses',
	'get_business',
	'get_evidence',
	'score_business',
	'explain_score',
	'find_segment',
	'start_claim',
	'submit_correction',
	'label_linkage',
	'report_issue'
];

export function toolsForRoute(path: string): RouteTools {
	const pathname = path.split('?')[0];
	if (pathname === '/ops' || pathname.startsWith('/ops/')) return { names: [], atlasId: null };
	if (pathname === '/tools') return { names: ALL_TOOLS, atlasId: null };
	const business = pathname.match(/^\/b\/([A-Za-z0-9_-]+)/);
	if (business) {
		return {
			atlasId: business[1],
			names: [
				'get_business',
				'get_evidence',
				'score_business',
				'explain_score',
				'start_claim',
				'submit_correction',
				'label_linkage',
				'report_issue',
				'search_businesses'
			]
		};
	}
	if (pathname === '/explore') {
		return { names: ['find_segment', ...EVERYWHERE], atlasId: null };
	}
	if (pathname === '/' || pathname === '/search') {
		return {
			names: ['search_businesses', 'find_segment', 'get_business', 'report_issue'],
			atlasId: null
		};
	}
	return { names: EVERYWHERE, atlasId: null };
}

interface ScopableTool {
	name: string;
	description: string;
	inputSchema: ScopableSchema;
	// Method syntax keeps the parameter bivariant so tools with typed inputs fit.
	execute(input: never, ...rest: never[]): unknown;
	[key: string]: unknown;
}

type Execute = (input: Record<string, unknown>, ...rest: unknown[]) => unknown;

/** On a business page, atlas_id defaults to the record on screen and stops being required. */
export function scopeToBusiness<T extends ScopableTool>(tool: T, atlasId: string): T {
	const atlasProperty = tool.inputSchema.properties.atlas_id;
	if (!atlasProperty) return tool;
	const run = tool.execute as unknown as Execute;
	const scoped = {
		...tool,
		description: `${tool.description} On this page atlas_id defaults to ${atlasId}.`,
		inputSchema: {
			...tool.inputSchema,
			required: (tool.inputSchema.required ?? []).filter((name) => name !== 'atlas_id'),
			properties: {
				...tool.inputSchema.properties,
				atlas_id: {
					...atlasProperty,
					description:
						`${atlasProperty.description ?? ''} Defaults to the business on this page.`.trim()
				}
			}
		},
		execute: (input: Record<string, unknown>, ...rest: unknown[]) =>
			run({ atlas_id: atlasId, ...input }, ...rest)
	};
	return scoped as unknown as T;
}
