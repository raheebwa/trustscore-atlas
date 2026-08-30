import { hashConfirmationToken } from '$lib/confirmation';

export type WriteRequestKind = 'correction' | 'linkage_label' | 'issue';
export type ConfirmationState = 'invalid' | 'unconfirmed' | 'expired' | 'confirmed' | 'rejected';

interface ConfirmationRecord extends Record<string, unknown> {
	status: unknown;
	expires_at: unknown;
}

export interface WriteConfirmationData<TRecord extends ConfirmationRecord = ConfirmationRecord> {
	state: ConfirmationState;
	record: TRecord | null;
	token: string | null;
}

interface ConfirmationStatusRow {
	request_id: string;
	status: string;
	expires_at: string;
}

function pageSelect(kind: WriteRequestKind): string {
	switch (kind) {
		case 'correction':
			return `SELECT correction_id, atlas_id, field, value, evidence_url,
			        requested_at, status, expires_at
			 FROM corrections
			 WHERE correction_id = ? AND confirmation_token_hash = ?`;
		case 'linkage_label':
			return `SELECT label_id, atlas_id, candidate_atlas_id, verdict,
			        requested_at, status, expires_at
			 FROM linkage_labels
			 WHERE label_id = ? AND confirmation_token_hash = ?`;
		case 'issue':
			return `SELECT issue_id, atlas_id, source, description,
			        requested_at, status, expires_at
			 FROM issues
			 WHERE issue_id = ? AND confirmation_token_hash = ?`;
	}
}

function statusSelect(kind: WriteRequestKind): string {
	switch (kind) {
		case 'correction':
			return `SELECT correction_id AS request_id, status, expires_at
			 FROM corrections
			 WHERE correction_id = ? AND confirmation_token_hash = ?`;
		case 'linkage_label':
			return `SELECT label_id AS request_id, status, expires_at
			 FROM linkage_labels
			 WHERE label_id = ? AND confirmation_token_hash = ?`;
		case 'issue':
			return `SELECT issue_id AS request_id, status, expires_at
			 FROM issues
			 WHERE issue_id = ? AND confirmation_token_hash = ?`;
	}
}

function confirmationState(row: { status: unknown; expires_at: unknown }): ConfirmationState {
	if (row.status === 'confirmed') return 'confirmed';
	if (row.status === 'rejected') return 'rejected';
	const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : Number.NaN;
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return 'expired';
	return row.status === 'unconfirmed' ? 'unconfirmed' : 'invalid';
}

export async function loadWriteConfirmation<
	TRecord extends ConfirmationRecord = ConfirmationRecord
>(
	db: D1Database,
	kind: WriteRequestKind,
	requestId: string,
	token: string
): Promise<WriteConfirmationData<TRecord>> {
	const tokenHash = await hashConfirmationToken(token);
	const record = await db.prepare(pageSelect(kind)).bind(requestId, tokenHash).first<TRecord>();
	if (!record) return { state: 'invalid', record: null, token: null };
	return { state: confirmationState(record), record, token };
}

function updateSql(kind: WriteRequestKind): string {
	switch (kind) {
		case 'correction':
			return `UPDATE corrections
			 SET confirmed_at = ?, status = ?
			 WHERE correction_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND expires_at > ?`;
		case 'linkage_label':
			return `UPDATE linkage_labels
			 SET confirmed_at = ?, status = ?
			 WHERE label_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND expires_at > ?`;
		case 'issue':
			return `UPDATE issues
			 SET confirmed_at = ?, status = ?
			 WHERE issue_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND expires_at > ?`;
	}
}

function eventSql(kind: WriteRequestKind): string {
	switch (kind) {
		case 'correction':
			return `INSERT INTO write_request_events
			 (event_id, request_type, request_id, event_type, occurred_at, payload)
			 SELECT ?, ?, correction_id, ?, ?, ?
			 FROM corrections
			 WHERE correction_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND confirmed_at = ?`;
		case 'linkage_label':
			return `INSERT INTO write_request_events
			 (event_id, request_type, request_id, event_type, occurred_at, payload)
			 SELECT ?, ?, label_id, ?, ?, ?
			 FROM linkage_labels
			 WHERE label_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND confirmed_at = ?`;
		case 'issue':
			return `INSERT INTO write_request_events
			 (event_id, request_type, request_id, event_type, occurred_at, payload)
			 SELECT ?, ?, issue_id, ?, ?, ?
			 FROM issues
			 WHERE issue_id = ? AND confirmation_token_hash = ?
			   AND status = ? AND confirmed_at = ?`;
	}
}

export async function confirmWriteRequest(
	db: D1Database,
	kind: WriteRequestKind,
	requestId: string,
	token: string
): Promise<ConfirmationState> {
	const tokenHash = await hashConfirmationToken(token);
	const row = await db
		.prepare(statusSelect(kind))
		.bind(requestId, tokenHash)
		.first<ConfirmationStatusRow>();
	if (!row) return 'invalid';
	const state = confirmationState(row);
	if (state !== 'unconfirmed') return state;

	const confirmedAt = new Date().toISOString();
	const eventId = `write_event_${crypto.randomUUID().replaceAll('-', '')}`;
	await db.batch([
		db
			.prepare(updateSql(kind))
			.bind(confirmedAt, 'confirmed', requestId, tokenHash, 'unconfirmed', confirmedAt),
		db
			.prepare(eventSql(kind))
			.bind(
				eventId,
				kind,
				'confirmed',
				confirmedAt,
				JSON.stringify({ previous_status: 'unconfirmed', status: 'confirmed' }),
				requestId,
				tokenHash,
				'confirmed',
				confirmedAt
			)
	]);
	return 'confirmed';
}
