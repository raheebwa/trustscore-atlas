// SPDX-License-Identifier: Apache-2.0
/**
 * The tools this page is offering, as the page itself built them.
 *
 * The browser's tool surface is one consumer of this list and not its owner: a visitor whose
 * browser has no agent surface still gets the same tools, described the same way and running the
 * same code, on the actions page. Whether a tool is registered with the browser changes who else
 * can call it, never whether a person can.
 */

import type { ToolTextResult } from './tools';

export interface PageTool {
	name: string;
	description: string;
	inputSchema: unknown;
	/** What a caller should expect of it: a read, or something that records a request. */
	annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
	execute: (input: never, context?: { signal?: AbortSignal }) => Promise<ToolTextResult>;
}

export const pageTools = $state<{ current: PageTool[] }>({ current: [] });

export function setPageTools(tools: PageTool[]): void {
	pageTools.current = tools;
}
