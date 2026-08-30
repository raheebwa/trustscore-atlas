// SPDX-License-Identifier: Apache-2.0
/**
 * The only way a document reaches a reader, and only a maintainer is a reader here: every /ops
 * path is behind the Access check in the server hook before this handler runs.
 *
 * A claimant's document is a stranger's file. It is served as an attachment and never sniffed, so
 * a browser cannot be talked into treating it as a page on this origin, and it is never cached.
 * The object is addressed through its own row, so a document can only be fetched under the claim
 * it actually belongs to.
 */

import { getDatabase, requireBucket } from '$lib/server/platform';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const db = getDatabase(platform, 'claims');
	const evidence = await db
		.prepare(
			`SELECT r2_key, content_type, byte_size FROM claim_evidence
			 WHERE evidence_id = ? AND claim_id = ?`
		)
		.bind(params.evidence_id, params.claim_id)
		.first<{ r2_key: string; content_type: string; byte_size: number }>();
	if (!evidence) return new Response('Not found.', { status: 404 });

	const object = await requireBucket(platform).get(evidence.r2_key);
	if (!object) return new Response('Not found.', { status: 404 });

	return new Response(object.body, {
		headers: {
			'content-type': evidence.content_type,
			'content-length': String(evidence.byte_size),
			'content-disposition': `attachment; filename="${params.evidence_id}"`,
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store',
			'referrer-policy': 'no-referrer'
		}
	});
};
