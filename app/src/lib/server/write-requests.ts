// SPDX-License-Identifier: Apache-2.0
import { json } from '@sveltejs/kit';
import { createConfirmationToken, hashConfirmationToken } from '$lib/confirmation';
import {
	FIELD_AUTHORITY_MESSAGE,
	isCorrectableField,
	type CorrectionInput,
	type IssueInput,
	type LinkageLabelInput
} from '$lib/write-requests';
import { apiBadRequest, apiNotFound, apiServerError } from './api';
import { envValue, getDatabase } from './platform';
import { verifyTurnstile } from './turnstile';
import { confirmWriteRequest, type WriteRequestKind } from './write-confirmation';

const DAY_MS = 24 * 60 * 60 * 1000;

interface PendingMetadata {
	requestId: string;
	eventId: string;
	requestedAt: string;
	expiresAt: string;
	plainToken: string;
	tokenHash: string;
}

interface EndpointEvent {
	platform?: App.Platform;
	request: Request;
	/** The request's own fetch, so a test can answer the challenge provider without a network. */
	fetch?: typeof fetch;
}

interface ConfirmEndpointEvent extends EndpointEvent {
	params: Record<string, string>;
}

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

async function pendingMetadata(prefix: string): Promise<PendingMetadata> {
	const requestedAt = new Date().toISOString();
	const plainToken = createConfirmationToken();
	return {
		requestId: newId(prefix),
		eventId: newId('write_event'),
		requestedAt,
		expiresAt: new Date(Date.parse(requestedAt) + DAY_MS).toISOString(),
		plainToken,
		tokenHash: await hashConfirmationToken(plainToken)
	};
}

function isPageForm(request: Request): boolean {
	const type = request.headers.get('content-type') ?? '';
	return type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data');
}

/**
 * The challenge a page form carries, when this deployment sets one.
 *
 * Only the forms a stranger can submit are gated: a form that already carries a claim's own token
 * is bounded by that token, and a second gate on it would be friction with nothing behind it. A
 * deployment with no secret configured is not gated at all, so a fork and a local checkout work
 * exactly as before.
 */
async function passesChallenge(
	platform: App.Platform | undefined,
	request: Request,
	input: Record<string, unknown> | null,
	fetchImpl?: typeof fetch
): Promise<boolean> {
	if (!isPageForm(request)) return true;
	const token = input?.['cf-turnstile-response'];
	const result = await verifyTurnstile({
		secret: envValue(platform, 'TURNSTILE_SECRET_KEY'),
		token: typeof token === 'string' ? token : null,
		remoteIp: request.headers.get('cf-connecting-ip'),
		fetchImpl
	});
	return result.ok;
}

/** JSON from tools and API clients; form fields from the page's own declarative forms. */
async function readObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		if (isPageForm(request)) {
			const form = await request.formData();
			const value: Record<string, unknown> = {};
			for (const [key, item] of form.entries()) {
				if (typeof item === 'string' && item.trim()) value[key] = item;
			}
			return value;
		}
		if (!request.headers.get('content-type')?.includes('application/json')) return null;
		const value: unknown = await request.json();
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** A page form gets sent to its confirmation page; everything else gets the JSON receipt. */
function pageRedirect(page: 'correct' | 'label' | 'report', metadata: PendingMetadata): Response {
	return new Response(null, {
		status: 303,
		headers: {
			Location: `/${page}/${encodeURIComponent(metadata.requestId)}?token=${encodeURIComponent(metadata.plainToken)}`
		}
	});
}

function validText(value: unknown, maxLength: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validUrl(value: unknown): value is string {
	if (!validText(value, 1000)) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

function pendingResponse(
	idKey: 'correction_id' | 'label_id' | 'issue_id',
	page: 'correct' | 'label' | 'report',
	metadata: PendingMetadata
): Response {
	return json(
		{
			[idKey]: metadata.requestId,
			status: 'unconfirmed',
			confirm_url: `/${page}/${encodeURIComponent(metadata.requestId)}?token=${encodeURIComponent(metadata.plainToken)}`,
			expires_at: metadata.expiresAt
		},
		{ status: 201 }
	);
}

function eventInsert(
	db: D1Database,
	metadata: PendingMetadata,
	kind: WriteRequestKind,
	payload: Record<string, unknown>
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO write_request_events
			 (event_id, request_type, request_id, event_type, occurred_at, payload)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(
			metadata.eventId,
			kind,
			metadata.requestId,
			'unconfirmed',
			metadata.requestedAt,
			JSON.stringify(payload)
		);
}

/**
 * The claim a correction is filed from.
 *
 * A correction outranks a register at the next regeneration, so it stands on a claim that was
 * verified, about this record, held by whoever holds that claim's own link. Everything else is
 * refused with the same word, so the endpoint cannot be used to learn which claims exist.
 */
async function claimBehindCorrection(
	db: D1Database,
	atlasId: string,
	claimId: unknown,
	claimToken: unknown
): Promise<{ ok: true; claimId: string } | { ok: false; error: string; message: string }> {
	if (!validText(claimId, 200) || !validText(claimToken, 512)) {
		return {
			ok: false,
			error: 'claim_required',
			message:
				'A correction is filed from a verified claim on this record. Claim the business first, prove it, then file the correction from the link you were given.'
		};
	}
	const claim = await db
		.prepare(
			`SELECT claim_id, atlas_id, status, verified_at, confirmation_token
			 FROM claims WHERE claim_id = ?`
		)
		.bind(claimId.trim())
		.first<{
			claim_id: string;
			atlas_id: string;
			status: string;
			verified_at: string | null;
			confirmation_token: string | null;
		}>();
	const presented = await hashConfirmationToken(claimToken.trim());
	if (
		!claim ||
		!claim.confirmation_token ||
		claim.confirmation_token !== presented ||
		claim.atlas_id !== atlasId ||
		claim.status !== 'confirmed'
	) {
		return {
			ok: false,
			error: 'claim_required',
			message: 'That claim is not one this record can be corrected from.'
		};
	}
	if (!claim.verified_at) {
		return {
			ok: false,
			error: 'claim_not_verified',
			message:
				'This claim is not verified yet. Publish the string Atlas gave you, or open the link it mailed you, and file the correction afterwards.'
		};
	}
	return { ok: true, claimId: claim.claim_id };
}

export async function createCorrectionEndpoint({
	platform,
	request
}: EndpointEvent): Promise<Response> {
	try {
		const value = await readObject(request);
		const input = value as
			| (Partial<CorrectionInput> & {
					claim_id?: unknown;
					claim_token?: unknown;
			  })
			| null;
		if (typeof input?.field === 'string' && !isCorrectableField(input.field)) {
			return json(
				{ error: 'field_not_correctable', message: FIELD_AUTHORITY_MESSAGE },
				{ status: 400 }
			);
		}
		if (
			!validText(input?.atlas_id, 200) ||
			!validText(input?.field, 100) ||
			!isCorrectableField(input.field) ||
			!validText(input?.value, 2000) ||
			!validUrl(input?.evidence_url)
		) {
			return apiBadRequest('invalid correction request');
		}

		const atlasId = input.atlas_id.trim();
		const field = input.field;
		const correctionValue = input.value.trim();
		const evidenceUrl = input.evidence_url.trim();
		const db = getDatabase(platform, 'corrections');
		const business = await db
			.prepare('SELECT atlas_id FROM businesses WHERE atlas_id = ?')
			.bind(atlasId)
			.first<{ atlas_id: string }>();
		if (!business) return apiNotFound('business_not_found');

		const claim = await claimBehindCorrection(db, atlasId, input.claim_id, input.claim_token);
		if (!claim.ok) {
			return json(
				{
					error: claim.error,
					message: claim.message,
					claim_url: `/claim/${encodeURIComponent(atlasId)}`
				},
				{ status: 403 }
			);
		}

		const metadata = await pendingMetadata('correction');
		const payload = {
			atlas_id: atlasId,
			field,
			value: correctionValue,
			evidence_url: evidenceUrl,
			claim_id: claim.claimId,
			status: 'unconfirmed',
			expires_at: metadata.expiresAt
		};
		await db.batch([
			db
				.prepare(
					`INSERT INTO corrections
					 (correction_id, atlas_id, claim_id, field, value, evidence_url, status,
					  requested_at, expires_at, confirmed_at, confirmation_token_hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					metadata.requestId,
					atlasId,
					claim.claimId,
					field,
					correctionValue,
					evidenceUrl,
					'unconfirmed',
					metadata.requestedAt,
					metadata.expiresAt,
					null,
					metadata.tokenHash
				),
			eventInsert(db, metadata, 'correction', payload)
		]);
		return pendingResponse('correction_id', 'correct', metadata);
	} catch (err) {
		return apiServerError(err);
	}
}

export async function createLinkageLabelEndpoint({
	platform,
	request
}: EndpointEvent): Promise<Response> {
	try {
		const value = await readObject(request);
		const input = value as Partial<LinkageLabelInput> | null;
		if (
			!validText(input?.atlas_id, 200) ||
			!validText(input?.candidate_atlas_id, 200) ||
			input.atlas_id.trim() === input.candidate_atlas_id.trim() ||
			(input?.verdict !== 'match' && input?.verdict !== 'non_match')
		) {
			return apiBadRequest('invalid linkage label request');
		}

		const atlasId = input.atlas_id.trim();
		const candidateAtlasId = input.candidate_atlas_id.trim();
		const verdict = input.verdict;
		const db = getDatabase(platform, 'linkage_labels');
		const pair = await db
			.prepare(
				`SELECT 1 AS present
				 FROM linkage_candidates
				 WHERE (atlas_id = ? AND candidate_atlas_id = ?)
				    OR (atlas_id = ? AND candidate_atlas_id = ?)
				 LIMIT 1`
			)
			.bind(atlasId, candidateAtlasId, candidateAtlasId, atlasId)
			.first<{ present: number }>();
		if (!pair) return apiNotFound('linkage_candidate_not_found');

		const metadata = await pendingMetadata('label');
		const payload = {
			atlas_id: atlasId,
			candidate_atlas_id: candidateAtlasId,
			verdict,
			status: 'unconfirmed',
			expires_at: metadata.expiresAt
		};
		await db.batch([
			db
				.prepare(
					`INSERT INTO linkage_labels
					 (label_id, atlas_id, candidate_atlas_id, verdict, status,
					  requested_at, expires_at, confirmed_at, confirmation_token_hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					metadata.requestId,
					atlasId,
					candidateAtlasId,
					verdict,
					'unconfirmed',
					metadata.requestedAt,
					metadata.expiresAt,
					null,
					metadata.tokenHash
				),
			eventInsert(db, metadata, 'linkage_label', payload)
		]);
		return pendingResponse('label_id', 'label', metadata);
	} catch (err) {
		return apiServerError(err);
	}
}

export async function createIssueEndpoint({
	fetch: fetchImpl,
	platform,
	request
}: EndpointEvent): Promise<Response> {
	try {
		const value = await readObject(request);
		const input = value as Partial<IssueInput> | null;
		if (!(await passesChallenge(platform, request, value, fetchImpl))) {
			// A page form ends on the page it came from, never on a body a reader cannot read.
			const atlasId = typeof input?.atlas_id === 'string' ? input.atlas_id.trim() : '';
			if (isPageForm(request) && atlasId) {
				return new Response(null, {
					status: 303,
					headers: { Location: `/b/${encodeURIComponent(atlasId)}?report=challenge_failed` }
				});
			}
			return apiBadRequest('the check on this form did not pass; reload the page and try again');
		}
		if (
			(input?.atlas_id !== undefined && !validText(input.atlas_id, 200)) ||
			(input?.source !== undefined && !validText(input.source, 200)) ||
			!validText(input?.description, 2000)
		) {
			return apiBadRequest('invalid issue report');
		}

		const atlasId = input.atlas_id?.trim() ?? null;
		const source = input.source?.trim() ?? null;
		const description = input.description.trim();
		const db = getDatabase(platform, 'issues');
		const metadata = await pendingMetadata('issue');
		const payload = {
			atlas_id: atlasId,
			source,
			description,
			status: 'unconfirmed',
			expires_at: metadata.expiresAt
		};
		await db.batch([
			db
				.prepare(
					`INSERT INTO issues
					 (issue_id, atlas_id, source, description, status, requested_at,
					  expires_at, confirmed_at, confirmation_token_hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					metadata.requestId,
					atlasId,
					source,
					description,
					'unconfirmed',
					metadata.requestedAt,
					metadata.expiresAt,
					null,
					metadata.tokenHash
				),
			eventInsert(db, metadata, 'issue', payload)
		]);
		return isPageForm(request)
			? pageRedirect('report', metadata)
			: pendingResponse('issue_id', 'report', metadata);
	} catch (err) {
		return apiServerError(err);
	}
}

async function readToken(request: Request): Promise<{ token: unknown; isPageForm: boolean }> {
	if (request.headers.get('content-type')?.includes('application/json')) {
		const value = await readObject(request);
		return { token: value?.token, isPageForm: false };
	}
	const form = await request.formData();
	return { token: form.get('token'), isPageForm: true };
}

function validToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 512;
}

export async function confirmWriteRequestEndpoint(
	{ platform, request }: ConfirmEndpointEvent,
	kind: WriteRequestKind,
	requestId: string,
	idKey: 'correction_id' | 'label_id' | 'issue_id',
	page: 'correct' | 'label' | 'report'
): Promise<Response> {
	try {
		const { token, isPageForm } = await readToken(request);
		if (!validToken(token)) return apiBadRequest('invalid confirmation request');
		const db = getDatabase(platform, 'write_request_events');
		const state = await confirmWriteRequest(db, kind, requestId, token);
		if (state === 'invalid' || state === 'rejected') {
			return apiBadRequest('invalid confirmation request');
		}
		if (state === 'expired') return json({ error: 'request_expired' }, { status: 410 });
		if (isPageForm) {
			return new Response(null, {
				status: 303,
				headers: {
					Location: `/${page}/${encodeURIComponent(requestId)}?token=${encodeURIComponent(token)}`
				}
			});
		}
		return json({ [idKey]: requestId, status: 'confirmed' });
	} catch (err) {
		return apiServerError(err);
	}
}
