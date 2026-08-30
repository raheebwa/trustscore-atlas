import { confirmWriteRequestEndpoint } from '$lib/server/write-requests';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	confirmWriteRequestEndpoint(event, 'linkage_label', event.params.label_id, 'label_id', 'label');
