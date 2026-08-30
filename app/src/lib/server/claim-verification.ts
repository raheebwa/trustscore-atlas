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

import { CLAIM_WINDOW_DAYS, hashClaimConfirmationToken } from '$lib/claims';
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
			`Or add <meta name="atlas-claim" content="${value}"> to the head of ${target}.`,
			'Then come back and ask Atlas to check. Either placement proves you control the site. Only the address above is fetched, so a path you gave is not part of the check.'
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

/** Minutes a mailed link stays usable. Short, because a link in a mailbox is a standing key. */
const EMAIL_MINUTES = 30;

export interface IssuedEmailChallenge {
	challenge_id: string;
	method: 'domain_email';
	/** The domain the address belongs to. The address itself is never stored. */
	target: string;
	expires_at: string;
	/** Handed to the mail once and never written down: only its hash is stored. */
	link_token: string;
}

/** The domain half of an address, refusing anything that could not receive public mail. */
function domainOf(email: string): string {
	const [local, domain, ...rest] = email.trim().toLowerCase().split('@');
	if (!local || !domain || rest.length > 0) throw new Error('That is not an email address.');
	if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
		throw new Error('That address is not at a public domain.');
	}
	if (!hasValidHost(new URL(`https://${domain}`))) {
		throw new Error('That address is not at a public domain.');
	}
	return domain;
}

/**
 * A mailed link for a domain the claim has already earned. Like the website challenge it is
 * prepared as a statement so it lands in the same batch as whatever asked for it, and like the
 * claim token only its hash is stored: the link in the mailbox is the only copy.
 */
export async function prepareEmailChallenge(
	db: D1Database,
	claimId: string,
	email: string,
	now: () => Date = () => new Date()
): Promise<{ issued: IssuedEmailChallenge; statement: D1PreparedStatement }> {
	const target = domainOf(email);
	const linkToken = `${randomToken()}${randomToken()}`;
	const tokenHash = await hashClaimConfirmationToken(linkToken);
	const challengeId = newId('chal');
	const issuedAt = now();
	const expiresAt = new Date(issuedAt.getTime() + EMAIL_MINUTES * 60 * 1000);

	const statement = db
		.prepare(
			`INSERT INTO claim_challenges
			 (challenge_id, claim_id, method, target, token_hash, created_at, expires_at, attempts)
			 VALUES (?, ?, 'domain_email', ?, ?, ?, ?, 0)`
		)
		.bind(challengeId, claimId, target, tokenHash, issuedAt.toISOString(), expiresAt.toISOString());

	return {
		issued: {
			challenge_id: challengeId,
			method: 'domain_email',
			target,
			expires_at: expiresAt.toISOString(),
			link_token: linkToken
		},
		statement
	};
}

/**
 * Whether this record may be mailed at this domain.
 *
 * Reading mail at a domain proves the domain, never the business, so the domain has to be one the
 * record itself points at: a website a register published for it. A claim that proved a domain by
 * publishing a string on it is already verified and never needs mail, so there is no second rule
 * here; this is the whole of it.
 */
export async function emailDomainAllowed(
	statementsDb: D1Database,
	atlasId: string,
	domain: string
): Promise<boolean> {
	const wanted = bareHost(domain);
	if (!wanted) return false;
	return (await publishedMailDomains(statementsDb, atlasId)).includes(wanted);
}

/**
 * The domains a register published as this record's website, which are the only domains a mailed
 * link may go to. Named on the page rather than left to a claimant to guess at.
 */
export async function publishedMailDomains(
	statementsDb: D1Database,
	atlasId: string
): Promise<string[]> {
	const published = await statementsDb
		.prepare("SELECT value FROM statements WHERE atlas_id = ? AND field = 'website'")
		.bind(atlasId)
		.all<{ value: string }>();
	const domains = (published.results ?? [])
		.map((row) => bareHost(row.value))
		.filter((host): host is string => Boolean(host));
	return [...new Set(domains)];
}

/**
 * The host a published website value names, without the www a register may or may not have
 * written, so one spelling of a domain is one domain.
 */
export function bareHost(value: string): string | null {
	const trimmed = value?.trim().toLowerCase();
	if (!trimmed) return null;
	try {
		const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
		return url.hostname.replace(/^www\./, '') || null;
	} catch {
		return null;
	}
}

/**
 * Spend a mailed link. The consume is the guard: one statement that only matches an unused,
 * unexpired link with the right token, so a link forwarded twice verifies once. The claim is
 * written only after that statement reports it moved a row.
 */
export async function consumeEmailChallenge(
	db: D1Database,
	challengeId: string,
	token: string,
	now: () => Date = () => new Date()
): Promise<AttemptResult> {
	const at = now().toISOString();
	const tokenHash = await hashClaimConfirmationToken(token.trim());

	// The consume is the guard: one statement that matches only an unused, unexpired link with the
	// right token, so a link forwarded to a group verifies once. It records that the link was spent
	// and says nothing yet about the claim, which has still to be written.
	const consumed = await db
		.prepare(
			`UPDATE claim_challenges SET consumed_at = ?
			 WHERE challenge_id = ? AND token_hash = ? AND method = 'domain_email'
			   AND consumed_at IS NULL AND expires_at > ?`
		)
		.bind(at, challengeId, tokenHash, at)
		.run();

	// Only after the link is spent is it worth saying why it could not be: reading first would be
	// a window in which the same link could be spent twice.
	if (consumed.meta.changes !== 1) {
		const challenge = await db
			.prepare(
				'SELECT expires_at, consumed_at FROM claim_challenges WHERE challenge_id = ? AND token_hash = ?'
			)
			.bind(challengeId, tokenHash)
			.first<{ expires_at: string; consumed_at: string | null }>();
		if (!challenge) return { verified: false, outcome: 'not_found' };
		if (challenge.consumed_at) return { verified: false, outcome: 'already_used' };
		return { verified: false, outcome: 'expired' };
	}

	const challenge = await db
		.prepare('SELECT claim_id, target FROM claim_challenges WHERE challenge_id = ?')
		.bind(challengeId)
		.first<{ claim_id: string; target: string }>();
	if (!challenge) return { verified: false, outcome: 'not_found' };

	// The same bounds the endpoints hold: a claim nobody confirmed, or one whose window has closed,
	// is not verifiable by a link that outlived it.
	const written = await db
		.prepare(
			`UPDATE claims SET verified_at = ?, verified_domain = ?,
			 verification_method = 'domain_email'
			 WHERE claim_id = ? AND verified_at IS NULL AND status = 'confirmed' AND expires_at > ?`
		)
		.bind(at, challenge.target, challenge.claim_id, at)
		.run();

	if (written.meta.changes !== 1) {
		const claim = await db
			.prepare('SELECT verified_at FROM claims WHERE claim_id = ?')
			.bind(challenge.claim_id)
			.first<{ verified_at: string | null }>();
		const outcome = claim?.verified_at ? 'already_verified' : 'claim_not_verifiable';
		await recordOutcome(db, challengeId, outcome);
		return { verified: false, outcome };
	}

	// The outcome is stamped with the audit row, after the claim moved, so a spent link never
	// claims a verification the claim did not take.
	await db.batch([
		db
			.prepare(
				`INSERT INTO claim_events (event_id, claim_id, event_type, occurred_at, payload)
				 VALUES (?, ?, 'email_verified', ?, ?)`
			)
			.bind(
				newId('claim_event'),
				challenge.claim_id,
				at,
				JSON.stringify({ method: 'domain_email', verified_domain: challenge.target })
			),
		db
			.prepare('UPDATE claim_challenges SET outcome = ? WHERE challenge_id = ?')
			.bind('verified:email', challengeId)
	]);

	return { verified: true, outcome: 'verified:email' };
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
