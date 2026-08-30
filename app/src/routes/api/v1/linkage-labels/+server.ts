import { createLinkageLabelEndpoint } from '$lib/server/write-requests';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => createLinkageLabelEndpoint(event);
