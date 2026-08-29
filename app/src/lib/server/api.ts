/**
 * JSON response helper for /api/v1/*: derives the ETag from the live
 * regeneration id and the request path, sets an open CORS policy for reads,
 * caches for a minute, and answers 304 when the client's If-None-Match
 * already matches (docs/PRD.md section 10.3, docs/ARCHITECTURE.md section 9).
 * Never forwards an upstream/database error message to the client
 * (docs/PRD.md section 13.4).
 */

import { json } from '@sveltejs/kit';
import { deriveEtag } from './etag';
import { getLiveRegenerationId } from './atlas';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export async function apiResponse(
	db: D1Database,
	request: Request,
	path: string,
	data: unknown,
	init: { status?: number } = {}
): Promise<Response> {
	const liveRegenerationId = (await getLiveRegenerationId(db)) ?? 'unseeded';
	const etag = deriveEtag(liveRegenerationId, path);
	const headers = {
		...CORS_HEADERS,
		'Cache-Control': 'public, max-age=60',
		ETag: etag
	};

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}

	return json(data, { status: init.status ?? 200, headers });
}

/** A safe 404 for the API: no database error text, just a plain not-found body. */
export function apiNotFound(message = 'not found'): Response {
	return json({ error: message }, { status: 404, headers: CORS_HEADERS });
}

export function apiBadRequest(message = 'invalid request'): Response {
	return json({ error: message }, { status: 400, headers: CORS_HEADERS });
}

/** A safe 500 for the API: logs server-side, never echoes the error to the client. */
export function apiServerError(err: unknown): Response {
	console.error(
		JSON.stringify({
			message: 'api error',
			error: err instanceof Error ? err.message : String(err)
		})
	);
	return json({ error: 'internal error' }, { status: 500, headers: CORS_HEADERS });
}

export function apiOptions(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}
