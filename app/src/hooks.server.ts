// SPDX-License-Identifier: Apache-2.0
import type { Handle } from '@sveltejs/kit';
import { accessConfigFrom, verifyAccessRequest } from '$lib/server/access';
import { applyRequestRateLimit } from '$lib/server/rate-limit';

function isMaintainerPath(pathname: string): boolean {
	return pathname === '/ops' || pathname.startsWith('/ops/');
}

/**
 * The maintainer surface is guarded here, before any load or action runs, so every transport
 * (page, data request, form action) meets the same check; the /ops layout repeats it for the
 * message it shows. The Worker verifies the Access JWT itself because the workers.dev and
 * preview hostnames carry no Access policy in front of them.
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (isMaintainerPath(event.url.pathname)) {
		const config = accessConfigFrom(event.platform?.env as Record<string, unknown> | undefined);
		const identity = await verifyAccessRequest(event.request, config);
		if (identity) event.locals.maintainer = identity.email;
		if (!identity) {
			return new Response('Maintainer access required.', {
				status: 403,
				headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
			});
		}
	}
	return applyRequestRateLimit(event.request, event.url, event.platform, () => resolve(event));
};
