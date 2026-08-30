// SPDX-License-Identifier: Apache-2.0
/**
 * Attach a document to a claim.
 *
 * A document never verifies anything: it can be forged and cannot be checked automatically, so it
 * supports a maintainer's reading of a claim and nothing more. This endpoint therefore guards the
 * store rather than the meaning: the size is refused from the declared length before the body is
 * read, the type is decided by the file's own first bytes, and the object lands under the claim in
 * a bucket that is never public.
 *
 * The claim's own token is the authorisation, exactly as it is for verification, and the same
 * bounds apply: a claim nobody confirmed, or one whose window has closed, takes no documents.
 */

import { hashClaimConfirmationToken } from '$lib/claims';
import { MAX_EVIDENCE_BYTES, storeEvidence } from '$lib/server/claim-evidence';
import {
	apiBadRequest,
	apiNotFound,
	apiOptions,
	apiServerError,
	claimPageRedirect
} from '$lib/server/api';
import { getDatabase, requireBucket } from '$lib/server/platform';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Documents one claim may attach. Enough for a licence and a letter, not a filing cabinet. */
const MAX_DOCUMENTS = 5;
/** The multipart envelope around a file at the limit: field names, boundaries and headers. */
const ENVELOPE_BYTES = 8 * 1024;

export const POST: RequestHandler = async ({ params, platform, request }) => {
	try {
		// Refused from what the request says about itself, before a byte of it is read.
		const declared = Number(request.headers.get('content-length') ?? '0');
		if (!Number.isFinite(declared) || declared > MAX_EVIDENCE_BYTES + ENVELOPE_BYTES) {
			return json({ error: 'evidence_too_large' }, { status: 413 });
		}

		const form = await request.formData();
		const token = form.get('token');
		const file = form.get('file');
		if (typeof token !== 'string' || !token.trim() || !(file instanceof File)) {
			return apiBadRequest('a document upload needs the claim token and one file');
		}

		const db = getDatabase(platform, 'claims');
		const claim = await db
			.prepare(
				`SELECT claim_id, atlas_id, status, expires_at, confirmation_token
				 FROM claims WHERE claim_id = ?`
			)
			.bind(params.claim_id)
			.first<{
				claim_id: string;
				atlas_id: string;
				status: string;
				expires_at: string | null;
				confirmation_token: string | null;
			}>();
		if (!claim) return apiNotFound('claim_not_found');

		const presented = await hashClaimConfirmationToken(token.trim());
		if (!claim.confirmation_token || claim.confirmation_token !== presented) {
			return apiNotFound('claim_not_found');
		}
		if (claim.status !== 'confirmed') {
			return json({ error: 'claim_not_confirmed' }, { status: 409 });
		}
		const closesAt = claim.expires_at ? Date.parse(claim.expires_at) : Number.NaN;
		if (!Number.isFinite(closesAt) || closesAt <= Date.now()) {
			return json({ error: 'claim_window_closed' }, { status: 410 });
		}

		const held = await db
			.prepare('SELECT count(*) AS documents FROM claim_evidence WHERE claim_id = ?')
			.bind(claim.claim_id)
			.first<{ documents: number }>();
		if ((held?.documents ?? 0) >= MAX_DOCUMENTS) {
			return json({ error: 'evidence_limit_reached' }, { status: 409 });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
			return json({ error: 'evidence_too_large' }, { status: 413 });
		}

		const note = form.get('note');
		let stored;
		try {
			stored = await storeEvidence(
				db,
				requireBucket(platform),
				claim.claim_id,
				bytes,
				typeof note === 'string' ? note.slice(0, 300) : null
			);
		} catch {
			// The only refusal storeEvidence makes on bytes this endpoint already sized is the type.
			return apiBadRequest('a document has to be a PDF, a PNG or a JPEG');
		}

		// A page claimant is sent back to their own claim rather than to a body they cannot read.
		// The form says so itself rather than being guessed at from headers the caller controls.
		if (form.get('from') === 'page') {
			return claimPageRedirect(claim.atlas_id, claim.claim_id, token.trim());
		}

		return json(
			{ status: 'stored', ...stored },
			{ status: 201, headers: { 'Access-Control-Allow-Origin': '*' } }
		);
	} catch (err) {
		return apiServerError(err);
	}
};

export const OPTIONS: RequestHandler = async () => apiOptions();
