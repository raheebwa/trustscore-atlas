// SPDX-License-Identifier: Apache-2.0
import { createCorrectionEndpoint } from '$lib/server/write-requests';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => createCorrectionEndpoint(event);
