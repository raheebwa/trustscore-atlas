// SPDX-License-Identifier: Apache-2.0
export const STATEMENTS_MAX_ROWS = 200;
export const STATEMENTS_BYTE_BUDGET = 60_000;
export const CURSOR_MAX_OFFSET = 10_000;

interface CursorPayload {
	v: 2;
	k: string;
	o: number;
	h: string;
	r: string | null;
}

export class InvalidCursorError extends Error {
	constructor() {
		super('Invalid cursor');
		this.name = 'InvalidCursorError';
	}
}

function toBase64Url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 512) throw new InvalidCursorError();
	const padding = '='.repeat((4 - (value.length % 4)) % 4);
	let binary: string;
	try {
		binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
	} catch {
		throw new InvalidCursorError();
	}
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new InvalidCursorError();
	}
}

function shortContextHash(context: string): string {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(context)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function normaliseContextPart(value: string | null | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ');
}

/** Stable context for a search cursor. Both parts are normalised before hashing. */
export function searchCursorContext(
	query: string,
	district: string | null | undefined,
	country?: string | null
): string {
	return JSON.stringify([
		normaliseContextPart(query),
		normaliseContextPart(district),
		normaliseContextPart(country)
	]);
}

/** Stable context shared by statement API and trace cursors. */
export function statementCursorContext(atlasId: string, field: string | null | undefined): string {
	return JSON.stringify([atlasId, field ?? '']);
}

export function encodeCursor(
	kind: string,
	offset: number,
	context: string,
	regenerationId: string | null
): string {
	if (
		!kind ||
		kind.length > 40 ||
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		offset > CURSOR_MAX_OFFSET ||
		typeof context !== 'string' ||
		(regenerationId !== null && (typeof regenerationId !== 'string' || regenerationId.length > 200))
	) {
		throw new InvalidCursorError();
	}
	return toBase64Url(
		JSON.stringify({
			v: 2,
			k: kind,
			o: offset,
			h: shortContextHash(context),
			r: regenerationId
		} satisfies CursorPayload)
	);
}

/** Builds a browser-safe search continuation without relying on a secret. */
export function buildSearchCursor(
	offset: number,
	query: string,
	district: string | null | undefined,
	regenerationId: string | null,
	country?: string | null
): string {
	return encodeCursor(
		'search',
		offset,
		searchCursorContext(query, district, country),
		regenerationId
	);
}

export function decodeCursor(
	cursor: string | null | undefined,
	kind: string,
	context: string,
	regenerationId: string | null
): number {
	if (!cursor) return 0;
	let parsed: unknown;
	try {
		parsed = JSON.parse(fromBase64Url(cursor));
	} catch (error) {
		if (error instanceof InvalidCursorError) throw error;
		throw new InvalidCursorError();
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		(parsed as Partial<CursorPayload>).v !== 2 ||
		(parsed as Partial<CursorPayload>).k !== kind ||
		!Number.isSafeInteger((parsed as Partial<CursorPayload>).o) ||
		((parsed as Partial<CursorPayload>).o ?? -1) < 0 ||
		((parsed as Partial<CursorPayload>).o ?? CURSOR_MAX_OFFSET + 1) > CURSOR_MAX_OFFSET ||
		(parsed as Partial<CursorPayload>).h !== shortContextHash(context) ||
		(parsed as Partial<CursorPayload>).r !== regenerationId
	) {
		throw new InvalidCursorError();
	}
	return (parsed as CursorPayload).o;
}

export function jsonByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
