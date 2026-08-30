// SPDX-License-Identifier: Apache-2.0
/**
 * Maintainer requests for the pipeline: regenerate now, or roll back to an earlier
 * regeneration. Requests are append-only rows with an event trail; the refresh workflow
 * consumes pending requests. A rollback is only accepted when the target regeneration is
 * known to the serving database and its SQL and its bundle both exist in R2, so the
 * databases and /downloads agree after the rollback.
 */

import { getLiveRegenerationId } from './atlas';
import { OpsError } from './ops';

export { OpsError };

export type RequestKind = 'regenerate' | 'rollback';
export type RequestStatus = 'pending' | 'dispatched' | 'running' | 'done' | 'failed' | 'refused';

export interface RegenerationRow {
	id: string;
	finished_at: string;
	status: string;
}

export interface RegenerationList {
	live: string | null;
	targets: RegenerationRow[];
}

export interface RegenerationRequestInput {
	kind: RequestKind;
	target_id: string | null;
	reason: string;
	requested_by: string;
}

export interface RegenerationRequest extends RegenerationRequestInput {
	request_id: string;
	requested_at: string;
}

export interface RequestView extends RegenerationRequest {
	status: RequestStatus;
	note: string | null;
	updated_at: string;
}

/** Keys a rollback needs on the bucket: the load SQL and the published bundle. */
export function rollbackKeys(targetId: string): string[] {
	return [`regen/${targetId}/swap.sql`, `bundles/${targetId}/manifest.json`];
}

export async function listRegenerations(db: D1Database): Promise<RegenerationList> {
	const [live, rows] = await Promise.all([
		getLiveRegenerationId(db),
		db
			.prepare(
				'SELECT id, finished_at, status FROM regenerations ORDER BY finished_at DESC LIMIT 10'
			)
			.bind()
			.all<RegenerationRow>()
	]);
	return {
		live,
		targets: (rows.results ?? []).filter((row) => row.id !== live)
	};
}

export async function listRequests(db: D1Database): Promise<RequestView[]> {
	const { results } = await db
		.prepare(
			`SELECT r.request_id, r.kind, r.target_id, r.reason, r.requested_by, r.requested_at,
			   e.status, e.note, e.occurred_at AS updated_at
			 FROM regeneration_requests r
			 JOIN regeneration_request_events e ON e.request_id = r.request_id
			 WHERE e.occurred_at = (SELECT MAX(occurred_at) FROM regeneration_request_events
			                        WHERE request_id = r.request_id)
			 ORDER BY r.requested_at DESC LIMIT 20`
		)
		.bind()
		.all<RequestView>();
	return results ?? [];
}

async function pendingCount(db: D1Database): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM regeneration_request_events e
			 WHERE e.status IN ('pending', 'dispatched', 'running')
			   AND e.occurred_at = (SELECT MAX(occurred_at) FROM regeneration_request_events
			                        WHERE request_id = e.request_id)`
		)
		.bind()
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export async function requestRegeneration(
	db: D1Database,
	input: RegenerationRequestInput,
	bucket?: R2Bucket
): Promise<RegenerationRequest> {
	const reason = input.reason.trim();
	if (!reason) throw new OpsError('A reason is required.');
	if (input.kind !== 'regenerate' && input.kind !== 'rollback') {
		throw new OpsError('Unknown request kind.');
	}
	if (!input.requested_by.trim()) throw new OpsError('The requesting maintainer is unknown.');

	let targetId: string | null = null;
	if (input.kind === 'rollback') {
		targetId = input.target_id?.trim() || null;
		if (!targetId) throw new OpsError('A rollback needs a target regeneration.');
		const { live, targets } = await listRegenerations(db);
		if (targetId === live) throw new OpsError('That regeneration is already live.');
		if (!targets.some((row) => row.id === targetId)) {
			throw new OpsError('Unknown regeneration; only the last ten are listed as targets.');
		}
		if (bucket) {
			for (const key of rollbackKeys(targetId)) {
				if (!(await bucket.head(key))) {
					throw new OpsError(`Rollback refused: ${key} is not in the bucket.`);
				}
			}
		}
	}
	if ((await pendingCount(db)) > 0) {
		throw new OpsError('A request is already pending; wait for the workflow to finish it.');
	}

	const request: RegenerationRequest = {
		kind: input.kind,
		target_id: targetId,
		reason,
		requested_by: input.requested_by,
		request_id: `rreq_${crypto.randomUUID().replaceAll('-', '')}`,
		requested_at: new Date().toISOString()
	};
	await db.batch([
		db
			.prepare(
				`INSERT INTO regeneration_requests
				 (request_id, kind, target_id, reason, requested_by, requested_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(
				request.request_id,
				request.kind,
				request.target_id,
				request.reason,
				request.requested_by,
				request.requested_at
			),
		db
			.prepare(
				`INSERT INTO regeneration_request_events (event_id, request_id, status, note, occurred_at)
				 VALUES (?, ?, 'pending', NULL, ?)`
			)
			.bind(
				`rrev_${crypto.randomUUID().replaceAll('-', '')}`,
				request.request_id,
				request.requested_at
			)
	]);
	return request;
}
