// SPDX-License-Identifier: Apache-2.0
/**
 * Turning a claim into a verified claim.
 *
 * A claim is a stranger asserting they run a business. Verification is the only thing between
 * that assertion and an operator statement that outranks every register, so the rules here are
 * deliberately unforgiving: the attempt is counted before it is made, so a crash cannot buy a
 * free retry; an exhausted or consumed challenge never reaches the network; the claim columns are
 * written once and never rewritten; and nothing the checked site said is ever stored.
 *
 * Documents are not in this path at all. A document can be forged and cannot be checked
 * automatically, so it may support a review but never advances the verification state.
 */

import { CLAIM_WINDOW_DAYS } from '$lib/claims';
import { hasValidHost, verifyWebsiteString } from './website-verify';

export interface IssuedChallenge {
	challenge_id: string;
	method: 'website_string';
	target: string;
	challenge_value: string;
	expires_at: string;
	instructions: string[];
}

export interface AttemptResult {
	verified: boolean;
	outcome: string;
	probe?: string;
}

const MAX_ATTEMPTS = 5;

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return [...bytes]
		.map((byte) => byte.toString(36).padStart(2, '0'))
		.join('')
		.slice(0, 16);
}

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

/**
 * The origin a string has to appear on, normalised so two spellings of one site are one target.
 * The host rules are the verifier's own, not a second set: a challenge issued against a host the
 * verifier would refuse looks like progress and burns an attempt every time it is checked.
 */
function originOf(websiteUrl: string): string {
	const url = new URL(websiteUrl);
	if (url.protocol !== 'https:') {
		throw new Error('A website challenge needs an https address.');
	}
	if (!hasValidHost(url)) {
		throw new Error('A website challenge needs a public https address.');
	}
	return `https://${url.hostname.toLowerCase()}`;
}

/** Throws when the address could never be checked, before anything is written. */
export function websiteChallengeTarget(websiteUrl: string): string {
	return originOf(websiteUrl.trim());
}

/**
 * The challenge as a statement the caller commits, so it lands in the same batch as the claim it
 * belongs to. A claim written without its challenge would leave the claimant holding a link to a
 * page that can never be completed, and claim rows cannot be cleaned up.
 */
export function prepareWebsiteChallenge(
	db: D1Database,
	claimId: string,
	websiteUrl: string,
	now: () => Date = () => new Date()
): { issued: IssuedChallenge; statement: D1PreparedStatement } {
	// The address is checked before anything is written: a challenge nobody could ever satisfy is
	// worse than a refusal, because it looks like progress.
	const target = websiteChallengeTarget(websiteUrl);
	const value = `atlas-verify-${randomToken()}`;
	const challengeId = newId('chal');
	const issuedAt = now();
	const expiresAt = new Date(issuedAt.getTime() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const statement = db
		.prepare(
			`INSERT INTO claim_challenges
			 (challenge_id, claim_id, method, target, challenge_value, created_at, expires_at, attempts)
			 VALUES (?, ?, 'website_string', ?, ?, ?, ?, 0)`
		)
		.bind(challengeId, claimId, target, value, issuedAt.toISOString(), expiresAt.toISOString());

	const issued: IssuedChallenge = {
		challenge_id: challengeId,
		method: 'website_string',
		target,
		challenge_value: value,
		expires_at: expiresAt.toISOString(),
		instructions: [
			`Publish ${value} at ${target}/.well-known/atlas-claim.txt, as the whole file.`,
			`Or add <meta name="atlas-claim" content="${value}"> to the page you named.`,
			'Then come back and ask Atlas to check. Either placement proves you control the site.'
		]
	};
	return { issued, statement };
}

/** Why the last check ended, kept on the challenge because it is what the claimant is shown. */
async function recordOutcome(db: D1Database, challengeId: string, outcome: string): Promise<void> {
	await db
		.prepare('UPDATE claim_challenges SET outcome = ? WHERE challenge_id = ?')
		.bind(outcome, challengeId)
		.run();
}

async function consume(
	db: D1Database,
	challengeId: string,
	outcome: string,
	at: string
): Promise<void> {
	await db
		.prepare('UPDATE claim_challenges SET outcome = ?, consumed_at = ? WHERE challenge_id = ?')
		.bind(outcome, at, challengeId)
		.run();
}

interface ChallengeRow {
	challenge_id: string;
	claim_id: string;
	method: string;
	target: string;
	challenge_value: string | null;
	expires_at: string;
	consumed_at: string | null;
	attempts: number;
}

export interface AttemptDependencies {
	verify?: typeof verifyWebsiteString;
	now?: () => Date;
	url?: string;
}

export async function runWebsiteAttempt(
	db: D1Database,
	challengeId: string,
	dependencies: AttemptDependencies = {}
): Promise<AttemptResult> {
	const verify = dependencies.verify ?? verifyWebsiteString;
	const at = (dependencies.now ?? (() => new Date()))().toISOString();

	const challenge = await db
		.prepare(
			`SELECT challenge_id, claim_id, method, target, challenge_value, expires_at, consumed_at, attempts
			 FROM claim_challenges WHERE challenge_id = ?`
		)
		.bind(challengeId)
		.first<ChallengeRow>();
	if (!challenge) return { verified: false, outcome: 'not_found' };
	if (challenge.consumed_at) return { verified: false, outcome: 'already_verified' };

	// This runs one method. A challenge of another shape leaves challenge_value null, and an empty
	// string to look for would match an empty file, so both are refused before the network.
	if (challenge.method !== 'website_string' || !challenge.challenge_value?.trim()) {
		return { verified: false, outcome: 'wrong_method' };
	}

	// Fails closed: an expiry that cannot be read is treated as closed, never as open.
	const expiresAt = Date.parse(challenge.expires_at);
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.parse(at)) {
		await recordOutcome(db, challengeId, 'expired');
		return { verified: false, outcome: 'expired' };
	}

	// Count the attempt first. A verifier that crashed after fetching would otherwise hand back an
	// unlimited number of tries against someone else's website.
	const claimed = await db
		.prepare(
			`UPDATE claim_challenges SET attempts = attempts + 1, last_attempt_at = ?
			 WHERE challenge_id = ? AND attempts < ? AND consumed_at IS NULL`
		)
		.bind(at, challengeId, MAX_ATTEMPTS)
		.run();
	if (claimed.meta.changes !== 1) {
		await recordOutcome(db, challengeId, 'attempts_exhausted');
		return { verified: false, outcome: 'attempts_exhausted' };
	}

	const result = await verify({
		url: dependencies.url ?? challenge.target,
		challengeValue: challenge.challenge_value,
		attempts: challenge.attempts
	});

	if (!result.ok) {
		await recordOutcome(db, challengeId, result.outcome);
		return { verified: false, outcome: result.outcome };
	}

	// Write-once: the guard in the statement, not in a read before it, so two attempts racing
	// cannot both decide the claim was theirs to verify.
	const written = await db
		.prepare(
			`UPDATE claims SET verified_at = ?, verified_domain = ?, verified_url = ?,
			 verification_method = 'website_string'
			 WHERE claim_id = ? AND verified_at IS NULL`
		)
		.bind(at, result.host, challenge.target, challenge.claim_id)
		.run();

	// The loser of that race verified nothing. Saying otherwise would credit it with a write the
	// claim never took, so it is told plainly that the claim was already through.
	if (written.meta.changes !== 1) {
		await consume(db, challengeId, 'already_verified', at);
		return { verified: false, outcome: 'already_verified' };
	}

	// The audit table every other claim transition writes to. The payload records what was proved
	// and where, never the string that proved it.
	await db.batch([
		db
			.prepare(
				`INSERT INTO claim_events (event_id, claim_id, event_type, occurred_at, payload)
				 VALUES (?, ?, 'website_verified', ?, ?)`
			)
			.bind(
				newId('claim_event'),
				challenge.claim_id,
				at,
				JSON.stringify({
					method: 'website_string',
					verified_domain: result.host,
					found_in: result.probe
				})
			),
		db
			.prepare('UPDATE claim_challenges SET outcome = ?, consumed_at = ? WHERE challenge_id = ?')
			.bind(`verified:${result.probe}`, at, challengeId)
	]);

	return { verified: true, outcome: `verified:${result.probe}`, probe: result.probe };
}
