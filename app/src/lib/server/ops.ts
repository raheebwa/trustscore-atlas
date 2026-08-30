/**
 * Maintainer operations shared by the /ops screens and any ops transport: list confirmed
 * requests awaiting a decision and record decisions. Safety rules live here, never in a
 * transport: one decision per request, a reason is mandatory, only confirmed requests
 * can be decided, and a decision never edits the request row (docs/PRD.md section 10.6).
 */

export type ModerationRequestType = 'claim' | 'correction' | 'linkage_label' | 'issue';
export type ModerationDecision = 'approved' | 'rejected';

export interface QueueItem {
	request_type: ModerationRequestType;
	request_id: string;
	atlas_id: string | null;
	summary: string;
	requested_at: string;
	confirmed_at: string | null;
}

export interface DecisionInput {
	request_type: ModerationRequestType;
	request_id: string;
	decision: ModerationDecision;
	reason: string;
	decided_by: string;
}

export interface DecisionRecord extends DecisionInput {
	decision_id: string;
	decided_at: string;
}

export class OpsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OpsError';
	}
}

const TABLES: Record<ModerationRequestType, { table: string; id: string; summary: string }> = {
	claim: { table: 'claims', id: 'claim_id', summary: 'claimant_role' },
	correction: { table: 'corrections', id: 'correction_id', summary: "field || ': ' || value" },
	linkage_label: {
		table: 'linkage_labels',
		id: 'label_id',
		summary: "verdict || ' with ' || candidate_atlas_id"
	},
	issue: { table: 'issues', id: 'issue_id', summary: 'description' }
};

export const REQUEST_TYPES = Object.keys(TABLES) as ModerationRequestType[];

function undecided(type: ModerationRequestType): string {
	const { table, id } = TABLES[type];
	return `NOT EXISTS (SELECT 1 FROM moderation_decisions d
	  WHERE d.request_type = '${type}' AND d.request_id = ${table}.${id})`;
}

export async function listQueue(db: D1Database): Promise<QueueItem[]> {
	const items: QueueItem[] = [];
	for (const type of REQUEST_TYPES) {
		const { table, id, summary } = TABLES[type];
		const atlasColumn = type === 'issue' ? 'atlas_id' : 'atlas_id';
		const { results } = await db
			.prepare(
				`SELECT ${id} AS request_id, ${atlasColumn} AS atlas_id, ${summary} AS summary,
				 requested_at, confirmed_at FROM ${table}
				 WHERE status = 'confirmed' AND ${undecided(type)}
				 ORDER BY confirmed_at ASC LIMIT 200`
			)
			.bind()
			.all<Omit<QueueItem, 'request_type'>>();
		for (const row of results ?? []) items.push({ request_type: type, ...row });
	}
	return items.sort((a, b) => (a.confirmed_at ?? '').localeCompare(b.confirmed_at ?? ''));
}

export async function decideRequest(db: D1Database, input: DecisionInput): Promise<DecisionRecord> {
	const reason = input.reason.trim();
	if (!reason) throw new OpsError('A reason is required.');
	if (input.decision !== 'approved' && input.decision !== 'rejected') {
		throw new OpsError('Decision must be approved or rejected.');
	}
	const spec = TABLES[input.request_type];
	if (!spec) throw new OpsError('Unknown request type.');
	if (!input.decided_by.trim()) throw new OpsError('The deciding maintainer is unknown.');

	const existing = await db
		.prepare(
			'SELECT decision_id FROM moderation_decisions WHERE request_type = ? AND request_id = ?'
		)
		.bind(input.request_type, input.request_id)
		.first<{ decision_id: string }>();
	if (existing) throw new OpsError('This request already has a decision.');

	const request = await db
		.prepare(`SELECT status FROM ${spec.table} WHERE ${spec.id} = ?`)
		.bind(input.request_id)
		.first<{ status: string }>();
	if (!request) throw new OpsError('No such request.');
	if (request.status !== 'confirmed') throw new OpsError('Only confirmed requests can be decided.');

	const record: DecisionRecord = {
		...input,
		reason,
		decision_id: `decision_${crypto.randomUUID().replaceAll('-', '')}`,
		decided_at: new Date().toISOString()
	};
	await db
		.prepare(
			`INSERT INTO moderation_decisions
			 (decision_id, request_type, request_id, decision, reason, decided_by, decided_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			record.decision_id,
			record.request_type,
			record.request_id,
			record.decision,
			record.reason,
			record.decided_by,
			record.decided_at
		)
		.run();
	return record;
}
