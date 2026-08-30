// SPDX-License-Identifier: Apache-2.0
/**
 * A document proves nothing on its own, so the rules here are about what may be stored rather than
 * about what it means: the bytes decide the type, the size is bounded, the key is under the claim,
 * and the row records what a maintainer would need to tell one document from another.
 */

import { describe, expect, it } from 'vitest';
import { evidenceKey, sha256Hex, sniffType, storeEvidence } from './claim-evidence';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
// The first bytes of a Windows executable, which names itself a PDF in every other way.
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);

function harness() {
	const puts: { key: string; options: R2PutOptions; size: number }[] = [];
	const rows: unknown[][] = [];
	const bucket = {
		put: async (key: string, value: ArrayBuffer | Uint8Array, options: R2PutOptions) => {
			puts.push({ key, options, size: (value as Uint8Array).byteLength });
			return {};
		}
	} as unknown as R2Bucket;
	const db = {
		prepare: () => ({
			bind: (...bindings: unknown[]) => ({
				run: async () => {
					rows.push(bindings);
					return { meta: { changes: 1 } };
				}
			})
		})
	} as unknown as D1Database;
	return { bucket, db, puts, rows };
}

describe('sniffType', () => {
	it.each([
		['a pdf', PDF, 'application/pdf'],
		['a png', PNG, 'image/png'],
		['a jpeg', JPEG, 'image/jpeg']
	])('reads %s from its own first bytes', (_label, bytes, type) => {
		expect(sniffType(bytes)).toBe(type);
	});

	it.each([
		['an executable', EXE],
		['an empty file', new Uint8Array()],
		['something that only starts to look like a pdf', new Uint8Array([0x25, 0x50])]
	])('refuses %s', (_label, bytes) => {
		expect(sniffType(bytes)).toBeNull();
	});
});

describe('storeEvidence', () => {
	it('stores the object under the claim and records what it is', async () => {
		const { bucket, db, puts, rows } = harness();

		const stored = await storeEvidence(
			db,
			bucket,
			'claim_1',
			PDF,
			' a trading licence ',
			() => new Date('2026-08-30T00:00:00Z')
		);

		expect(stored).toMatchObject({
			content_type: 'application/pdf',
			byte_size: PDF.byteLength,
			sha256: await sha256Hex(PDF)
		});
		expect(stored.evidence_id).toMatch(/^evidence_[0-9a-f]{32}$/);
		expect(puts[0].key).toBe(evidenceKey('claim_1', stored.evidence_id));
		// Never cached anywhere, because it is never public.
		expect(puts[0].options.httpMetadata).toMatchObject({
			contentType: 'application/pdf',
			cacheControl: 'no-store'
		});
		expect(rows[0]).toEqual([
			stored.evidence_id,
			'claim_1',
			`claims/claim_1/${stored.evidence_id}`,
			'application/pdf',
			PDF.byteLength,
			await sha256Hex(PDF),
			'2026-08-30T00:00:00.000Z',
			'a trading licence'
		]);
	});

	it('refuses a file whose bytes are not one of the three, and stores nothing', async () => {
		const { bucket, db, puts, rows } = harness();

		await expect(storeEvidence(db, bucket, 'claim_1', EXE, null)).rejects.toThrow(/PDF/);
		expect(puts).toHaveLength(0);
		expect(rows).toHaveLength(0);
	});

	it('refuses a file over the size limit, and stores nothing', async () => {
		const { bucket, db, puts, rows } = harness();
		const big = new Uint8Array(5 * 1024 * 1024 + 1);
		big.set(PDF);

		await expect(storeEvidence(db, bucket, 'claim_1', big, null)).rejects.toThrow(/megabytes/);
		expect(puts).toHaveLength(0);
		expect(rows).toHaveLength(0);
	});
});
