import type { Handle } from '@sveltejs/kit';
import { applyRequestRateLimit } from '$lib/server/rate-limit';

export const handle: Handle = async ({ event, resolve }) =>
	applyRequestRateLimit(event.request, event.url, event.platform, () => resolve(event));
