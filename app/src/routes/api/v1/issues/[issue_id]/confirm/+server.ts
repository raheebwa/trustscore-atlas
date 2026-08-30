import { confirmWriteRequestEndpoint } from '$lib/server/write-requests';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	confirmWriteRequestEndpoint(event, 'issue', event.params.issue_id, 'issue_id', 'report');
