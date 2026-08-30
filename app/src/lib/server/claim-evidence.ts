// SPDX-License-Identifier: Apache-2.0
/**
 * Documents a claimant attaches to a claim.
 *
 * A document can be forged and cannot be checked automatically, so nothing here advances the
 * verification state: evidence supports a maintainer's reading of a claim and never proves it.
 * What this layer does guarantee is that what lands in the bucket is what it says it is, that a
 * claimant cannot use the upload to store anything else, and that it is never public.
 *
 * The type is decided by the file's own first bytes, never by the name or the content type the
 * uploader declared, because both are written by whoever is uploading.
 */

/** Five megabytes. Big enough for a scanned licence, small enough to refuse before reading. */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { type: string; bytes: number[] }[] = [
	{ type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
	{ type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	{ type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }
];

/** The type the bytes themselves declare, or null for anything else. */
export function sniffType(bytes: Uint8Array): string | null {
	for (const signature of SIGNATURES) {
		if (signature.bytes.every((byte, index) => bytes[index] === byte)) return signature.type;
	}
	return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Where a document lives. Under the claim, never guessable from the record, never public. */
export function evidenceKey(claimId: string, evidenceId: string): string {
	return `claims/${claimId}/${evidenceId}`;
}

export interface StoredEvidence {
	evidence_id: string;
	content_type: string;
	byte_size: number;
	sha256: string;
}

/**
 * Store one document against a claim. The object goes to the bucket first: a row pointing at an
 * object that is not there would show a maintainer a document that cannot be opened, while an
 * object with no row is invisible and harmless.
 */
export async function storeEvidence(
	db: D1Database,
	bucket: R2Bucket,
	claimId: string,
	bytes: Uint8Array,
	note: string | null,
	now: () => Date = () => new Date()
): Promise<StoredEvidence> {
	const contentType = sniffType(bytes);
	if (!contentType) {
		throw new Error('Evidence has to be a PDF, a PNG or a JPEG.');
	}
	if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
		throw new Error('Evidence has to be under five megabytes.');
	}

	const evidenceId = `evidence_${crypto.randomUUID().replaceAll('-', '')}`;
	const key = evidenceKey(claimId, evidenceId);
	const sha256 = await sha256Hex(bytes);

	await bucket.put(key, bytes as BufferSource, {
		httpMetadata: { contentType, cacheControl: 'no-store' },
		sha256
	});

	await db
		.prepare(
			`INSERT INTO claim_evidence
			 (evidence_id, claim_id, r2_key, content_type, byte_size, sha256, uploaded_at, uploaded_note)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			evidenceId,
			claimId,
			key,
			contentType,
			bytes.byteLength,
			sha256,
			now().toISOString(),
			note?.trim() || null
		)
		.run();

	return {
		evidence_id: evidenceId,
		content_type: contentType,
		byte_size: bytes.byteLength,
		sha256
	};
}
