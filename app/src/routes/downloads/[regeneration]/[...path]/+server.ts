import { error } from '@sveltejs/kit';
import { resolveDownloadKey } from '$lib/server/downloads';
import { requireBucket } from '$lib/server/platform';
import type { RequestHandler } from './$types';

/** Streams one bundle file from R2; bundle files are immutable per regeneration. */
export const GET: RequestHandler = async ({ platform, params, request }) => {
	const key = resolveDownloadKey(params.regeneration, params.path);
	if (!key) error(404, 'No such file.');
	const object = await requireBucket(platform).get(key);
	if (!object) error(404, 'No such file.');
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('ETag', object.httpEtag);
	headers.set('Content-Length', String(object.size));
	headers.set('Cache-Control', 'public, max-age=86400, immutable');
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set(
		'Content-Disposition',
		`attachment; filename="${params.path.split('/').pop() ?? 'download'}"`
	);
	if (request.headers.get('if-none-match') === object.httpEtag) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(object.body, { headers });
};
