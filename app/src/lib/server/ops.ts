// SPDX-License-Identifier: Apache-2.0
/**
 * Maintainer operations shared by the /ops screens and any ops transport: list confirmed
 * requests awaiting a decision and record decisions. Safety rules live here, never in a
 * transport: one decision per request, a reason is mandatory, only confirmed requests
 * can be decided, and a decision never edits the request row (docs/PRD.md section 10.6).
 *
 * Approval is also where verification is enforced. A verified claim is the only thing that
 * outranks a register, so nothing unverified can be approved, and a claim whose proven domain is
 * not one the record itself publishes needs the maintainer to say what connects the two. Rejection
 * is never gated: a request that cannot be approved must still be closeable.
 */

import { bareHost } from './claim-verification';

export type ModerationRequestType = 'claim' | 'correction' | 'linkage_label' | 'issue';
export type ModerationDecision = 'approved' | 'rejected';

export interface QueueItem {
	request_type: ModerationRequestType;
	request_id: string;
	atlas_id: string | null;
	summary: string;
	requested_at: string;
	confirmed_at: string | null;
	/** Present on the request types an approval can turn into an operator statement. */
	verification?: VerificationDetail;
	/** The field a correction asks to change, which decides whether Atlas can publish it. */
	field?: string | null;
}

/**
 * What a maintainer needs to see before approving. A proven domain says the claimant controls a
 * website; whether the record itself publishes that website is the separate question, and it is
 * shown separately rather than folded into one word.
 */
export interface VerificationDetail {
	state: 'unverified' | 'verified';
	method: string | null;
	verified_domain: string | null;
	domain_matches_register: boolean;
	/** The documents attached to the claim, which a maintainer opens from the queue. */
	evidence: EvidenceRef[];
}

export interface EvidenceRef {
	evidence_id: string;
	claim_id: string;
	content_type: string;
	uploaded_at: string;
	uploaded_note: string | null;
}

export interface DecisionInput {
	request_type: ModerationRequestType;
	request_id: string;
	decision: ModerationDecision;
	reason: string;
	decided_by: string;
	/**
	 * The maintainer's own statement that they checked what connects the proven domain to this
	 * business. Only consulted when no register published that domain for the record.
	 */
	domain_relationship_reviewed?: boolean;
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

interface TableSpec {
	table: string;
	id: string;
	summary: string;
	/** The columns a decision needs, beyond status. Read by name: a request row holds secrets. */
	columns: string[];
	/** How this request names the claim it stands on, when it stands on one. */
	claimColumn?: string;
}

const TABLES: Record<ModerationRequestType, TableSpec> = {
	claim: {
		table: 'claims',
		id: 'claim_id',
		summary: 'claimant_role',
		columns: ['claim_id', 'atlas_id'],
		claimColumn: 'claim_id'
	},
	correction: {
		table: 'corrections',
		id: 'correction_id',
		summary: "field || ': ' || value",
		columns: ['correction_id', 'atlas_id', 'claim_id', 'field', 'value'],
		claimColumn: 'claim_id'
	},
	linkage_label: {
		table: 'linkage_labels',
		id: 'label_id',
		summary: "verdict || ' with ' || candidate_atlas_id",
		columns: ['label_id', 'atlas_id']
	},
	issue: {
		table: 'issues',
		id: 'issue_id',
		summary: 'description',
		columns: ['issue_id', 'atlas_id']
	}
};

/**
 * Fields an approved correction may assert. A website or a description is correctable but not
 * published by the pipeline, and a website is what the domain check itself reads, so an approval
 * must never be able to nominate one.
 */
const PUBLISHABLE_CORRECTION_FIELDS = new Set([
	'canonical_name',
	'name_variants',
	'sector.source_category',
	'sector.source_nature',
	'location.district',
	'location.division_or_subcounty'
]);

export const REQUEST_TYPES = Object.keys(TABLES) as ModerationRequestType[];

function undecided(type: ModerationRequestType): string {
	const { table, id } = TABLES[type];
	return `NOT EXISTS (SELECT 1 FROM moderation_decisions d
	  WHERE d.request_type = '${type}' AND d.request_id = ${table}.${id})`;
}

/** The claim behind a request, with everything the gate and the queue both need to read. */
interface ClaimFacts {
	claim_id: string;
	atlas_id: string | null;
	verified_at: string | null;
	verified_domain: string | null;
	verification_method: string | null;
}

/** `?, ?, ?` for a bound list, so one query answers for every row a listing returned. */
function placeholders(count: number): string {
	return new Array(count).fill('?').join(', ');
}

async function claimsByIds(db: D1Database, ids: string[]): Promise<Map<string, ClaimFacts>> {
	if (ids.length === 0) return new Map();
	const { results } = await db
		.prepare(
			`SELECT claim_id, atlas_id, verified_at, verified_domain, verification_method
			 FROM claims WHERE claim_id IN (${placeholders(ids.length)})`
		)
		.bind(...ids)
		.all<ClaimFacts>();
	return new Map((results ?? []).map((claim) => [claim.claim_id, claim]));
}

async function evidenceByClaims(
	db: D1Database,
	ids: string[]
): Promise<Map<string, EvidenceRef[]>> {
	const byClaim = new Map<string, EvidenceRef[]>();
	if (ids.length === 0) return byClaim;
	const { results } = await db
		.prepare(
			`SELECT evidence_id, claim_id, content_type, uploaded_at, uploaded_note
			 FROM claim_evidence WHERE claim_id IN (${placeholders(ids.length)})
			 ORDER BY uploaded_at`
		)
		.bind(...ids)
		.all<EvidenceRef>();
	for (const row of results ?? []) {
		byClaim.set(row.claim_id, [...(byClaim.get(row.claim_id) ?? []), row]);
	}
	return byClaim;
}

/**
 * The websites registers published for these records, as bare hosts.
 *
 * A regeneration drops and rebuilds the statements table, so this read can fail while the queue
 * itself is fine. It answers empty in that case rather than throwing: an unanswered register check
 * reads as "no register published this", which asks the maintainer to say what connects the domain
 * to the business, and the queue stays openable so that anything can still be rejected.
 */
async function publishedWebsites(
	statementsDb: D1Database,
	atlasIds: string[]
): Promise<Map<string, Set<string>>> {
	const byRecord = new Map<string, Set<string>>();
	if (atlasIds.length === 0) return byRecord;
	try {
		const { results } = await statementsDb
			.prepare(
				`SELECT atlas_id, value FROM statements
				 WHERE atlas_id IN (${placeholders(atlasIds.length)}) AND field = 'website'`
			)
			.bind(...atlasIds)
			.all<{ atlas_id: string; value: string }>();
		for (const row of results ?? []) {
			const host = bareHost(row.value);
			if (!host) continue;
			byRecord.set(row.atlas_id, (byRecord.get(row.atlas_id) ?? new Set()).add(host));
		}
	} catch (cause) {
		console.error(
			JSON.stringify({
				message: 'register websites unavailable',
				error: cause instanceof Error ? cause.message : String(cause)
			})
		);
	}
	return byRecord;
}

const UNVERIFIABLE: VerificationDetail = {
	state: 'unverified',
	method: null,
	verified_domain: null,
	domain_matches_register: false,
	evidence: []
};

function verificationFrom(
	claim: ClaimFacts,
	published: Set<string> | undefined,
	evidence: EvidenceRef[]
): VerificationDetail {
	const domain = bareHost(claim.verified_domain ?? '');
	return {
		state: claim.verified_at ? 'verified' : 'unverified',
		method: claim.verification_method,
		verified_domain: domain,
		domain_matches_register: Boolean(domain && published?.has(domain)),
		evidence
	};
}

export async function listQueue(db: D1Database, statementsDb: D1Database): Promise<QueueItem[]> {
	const items: QueueItem[] = [];
	const claimOf = new Map<QueueItem, string>();

	for (const type of REQUEST_TYPES) {
		const { table, id, summary, claimColumn } = TABLES[type];
		const claimSelect = claimColumn && claimColumn !== id ? `, ${claimColumn} AS claim_id` : '';
		const { results } = await db
			.prepare(
				`SELECT ${id} AS request_id, atlas_id, ${summary} AS summary,
				 requested_at, confirmed_at${claimSelect}${type === 'correction' ? ', field' : ''}
				 FROM ${table}
				 WHERE status = 'confirmed' AND ${undecided(type)}
				 ORDER BY confirmed_at ASC LIMIT 200`
			)
			.bind()
			.all<Omit<QueueItem, 'request_type'> & { claim_id?: string | null }>();
		for (const row of results ?? []) {
			const { claim_id: rowClaimId, ...rest } = row;
			const item: QueueItem = { request_type: type, ...rest };
			// A claim, and a correction filed from one, both stand or fall on the same claim.
			const claimId = type === 'claim' ? item.request_id : (rowClaimId ?? null);
			if (claimId) claimOf.set(item, claimId);
			items.push(item);
		}
	}

	// Three reads for the whole queue rather than three per row: a backlog is exactly when this
	// screen has to open.
	const claimIds = [...new Set(claimOf.values())];
	const [claims, evidence] = await Promise.all([
		claimsByIds(db, claimIds),
		evidenceByClaims(db, claimIds)
	]);
	const atlasIds = [...new Set([...claims.values()].map((claim) => claim.atlas_id))].filter(
		(atlasId): atlasId is string => Boolean(atlasId)
	);
	const websites = await publishedWebsites(statementsDb, atlasIds);

	for (const [item, claimId] of claimOf) {
		const claim = claims.get(claimId);
		// A request naming a claim that is not there is not approvable, and says so on the screen
		// rather than showing nothing and refusing at the button.
		item.verification = claim
			? verificationFrom(
					claim,
					claim.atlas_id ? websites.get(claim.atlas_id) : undefined,
					evidence.get(claimId) ?? []
				)
			: UNVERIFIABLE;
	}

	return items.sort((a, b) => (a.confirmed_at ?? '').localeCompare(b.confirmed_at ?? ''));
}

const UNVERIFIED = 'This claim is not verified. Only a verified claim can be approved.';
const UNMATCHED =
	'No register published this domain for this record. Tick "domain relationship reviewed" and say in the reason what shows the domain belongs to this business.';
const WRONG_RECORD =
	'This request is about a different record from the claim it was filed from, so approving it would assert something about a business nobody proved.';

/** Refused by name, so a maintainer knows which fields an approval can and cannot publish. */
function unpublishable(field: string): string {
	return `Atlas does not publish ${field || 'this field'}, so an approval here would have no effect. Reject it with that reason, or ask for a field the pipeline publishes.`;
}

/**
 * What the queue should offer for one request, in the same words the decision would refuse it
 * with, so a maintainer never presses a button to be told what the screen could have said.
 */
export interface ApprovalGate {
	approvable: boolean;
	needs_relationship_review: boolean;
	reason: string | null;
}

export function approvalGate(item: {
	verification?: VerificationDetail;
	request_type?: ModerationRequestType;
	field?: string | null;
}): ApprovalGate {
	// A correction can only assert a field the pipeline publishes, whatever the claim behind it.
	if (
		item.request_type === 'correction' &&
		item.field &&
		!PUBLISHABLE_CORRECTION_FIELDS.has(item.field)
	) {
		return {
			approvable: false,
			needs_relationship_review: false,
			reason: unpublishable(item.field)
		};
	}
	const verification = item.verification;
	// Issues, linkage labels, and a correction filed before claims could be bound assert nothing
	// about a claimant, so nothing gates them.
	if (!verification) return { approvable: true, needs_relationship_review: false, reason: null };
	if (verification.state !== 'verified') {
		return { approvable: false, needs_relationship_review: false, reason: UNVERIFIED };
	}
	if (!verification.domain_matches_register) {
		return { approvable: true, needs_relationship_review: true, reason: UNMATCHED };
	}
	return { approvable: true, needs_relationship_review: false, reason: null };
}

/** The operator statement an approval asserts, or null when the decision asserts nothing. */
interface AssertedStatement {
	claim_id: string;
	atlas_id: string;
	field: string;
	value: string;
}

export async function decideRequest(
	db: D1Database,
	statementsDb: D1Database,
	input: DecisionInput
): Promise<DecisionRecord> {
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
		.prepare(`SELECT * FROM ${spec.table} WHERE ${spec.id} = ?`)
		.bind(input.request_id)
		.first<Record<string, unknown>>();
	if (!request) throw new OpsError('No such request.');
	if (request.status !== 'confirmed') throw new OpsError('Only confirmed requests can be decided.');

	const { asserted, matched } =
		input.decision === 'approved'
			? await assertionFor(db, statementsDb, input, request)
			: { asserted: null, matched: null };

	const record: DecisionRecord = {
		...input,
		reason,
		decision_id: `decision_${crypto.randomUUID().replaceAll('-', '')}`,
		decided_at: new Date().toISOString()
	};
	// The decision, what it rested on, and what it asserts are written together: an approval whose
	// statement failed to land would be a decision with no author's record, and a statement with no
	// decision would have no author. The statement is what a later regeneration compiles into the
	// published record; nothing reads it yet, so an approval today records the assertion and
	// changes nothing that is served. The basis is written with it because it cannot be
	// reconstructed later:
	// a regeneration rebuilds the statements table, so the register check can answer differently
	// tomorrow than it did at the moment of the decision.
	try {
		await writeDecision(db, record, asserted, matched, input);
	} catch (cause) {
		// Two maintainers deciding at once: the unique index refuses the second, and it is told the
		// same thing the read a moment earlier would have said.
		const existing = await db
			.prepare(
				'SELECT decision_id FROM moderation_decisions WHERE request_type = ? AND request_id = ?'
			)
			.bind(input.request_type, input.request_id)
			.first<{ decision_id: string }>();
		if (existing) throw new OpsError('This request already has a decision.');
		throw cause;
	}
	return record;
}

async function writeDecision(
	db: D1Database,
	record: DecisionRecord,
	asserted: AssertedStatement | null,
	matched: boolean | null,
	input: DecisionInput
): Promise<void> {
	await db.batch([
		db
			.prepare(
				`INSERT INTO moderation_decisions
				 (decision_id, request_type, request_id, decision, reason, decided_by, decided_at,
				  domain_matched_register, domain_relationship_reviewed)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				record.decision_id,
				record.request_type,
				record.request_id,
				record.decision,
				record.reason,
				record.decided_by,
				record.decided_at,
				matched === null ? null : matched ? 1 : 0,
				input.domain_relationship_reviewed ? 1 : 0
			),
		...(asserted
			? [
					db
						.prepare(
							`INSERT INTO operator_statements
							 (operator_statement_id, claim_id, atlas_id, field, value, source_ref,
							  asserted_at, decision_id, created_at)
							 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
						)
						.bind(
							`operator_statement_${crypto.randomUUID().replaceAll('-', '')}`,
							asserted.claim_id,
							asserted.atlas_id,
							asserted.field,
							asserted.value,
							asserted.claim_id,
							record.decided_at,
							record.decision_id,
							record.decided_at
						)
				]
			: [])
	]);
}

/**
 * What an approval asserts, after checking it may be asserted at all.
 *
 * A claim asserts that an operator was verified. A correction filed from a claim asserts the field
 * and value it asked for, on the same record that claim is about. A correction filed from no claim
 * asserts nothing on its own: it is recorded as a decision, exactly as it was before claims could
 * be verified at all, and starts asserting once corrections carry the claim they were filed from.
 *
 * The register match and the record are read from the claim, and the correction has to name the
 * same record, so a claimant verified on one business cannot assert anything about another.
 */
async function assertionFor(
	db: D1Database,
	statementsDb: D1Database,
	input: DecisionInput,
	request: Record<string, unknown>
): Promise<{ asserted: AssertedStatement | null; matched: boolean | null }> {
	if (input.request_type !== 'claim' && input.request_type !== 'correction') {
		return { asserted: null, matched: null };
	}

	const claimId =
		input.request_type === 'claim'
			? input.request_id
			: ((request.claim_id as string | null) ?? null);
	if (!claimId) return { asserted: null, matched: null };

	const claim = (await claimsByIds(db, [claimId])).get(claimId);
	if (!claim || !claim.verified_at) throw new OpsError(UNVERIFIED);

	const domain = bareHost(claim.verified_domain ?? '');
	const websites = claim.atlas_id
		? await publishedWebsites(statementsDb, [claim.atlas_id])
		: new Map<string, Set<string>>();
	const matched = Boolean(domain && claim.atlas_id && websites.get(claim.atlas_id)?.has(domain));
	if (!matched && !input.domain_relationship_reviewed) throw new OpsError(UNMATCHED);

	const atlasId = request.atlas_id as string | null;
	if (!atlasId || !claim.atlas_id) throw new OpsError('This request names no record.');
	if (atlasId !== claim.atlas_id) throw new OpsError(WRONG_RECORD);

	if (input.request_type === 'claim') {
		return {
			asserted: {
				claim_id: claimId,
				atlas_id: atlasId,
				field: 'status.operator_verified',
				value: 'verified'
			},
			matched
		};
	}

	const field = String(request.field ?? '');
	const value = String(request.value ?? '');
	if (!PUBLISHABLE_CORRECTION_FIELDS.has(field)) throw new OpsError(unpublishable(field));
	if (!value.trim()) throw new OpsError('This correction has no value to assert.');
	return { asserted: { claim_id: claimId, atlas_id: atlasId, field, value }, matched };
}
