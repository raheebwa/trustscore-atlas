// SPDX-License-Identifier: Apache-2.0
import { confirmWriteRequestEndpoint } from '$lib/server/write-requests';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	confirmWriteRequestEndpoint(
		event,
		'correction',
		event.params.correction_id,
		'correction_id',
		'correct'
	);
