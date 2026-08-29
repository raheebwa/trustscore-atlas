export const STATEMENTS_MAX_ROWS = 200;
export const STATEMENTS_BYTE_BUDGET = 60_000;

interface CursorPayload {
	v: 1;
	k: string;
	o: number;
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

export function encodeCursor(kind: string, offset: number): string {
	if (!kind || !Number.isSafeInteger(offset) || offset < 0) throw new InvalidCursorError();
	return toBase64Url(JSON.stringify({ v: 1, k: kind, o: offset } satisfies CursorPayload));
}

export function decodeCursor(cursor: string | null | undefined, kind: string): number {
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
		(parsed as Partial<CursorPayload>).v !== 1 ||
		(parsed as Partial<CursorPayload>).k !== kind ||
		!Number.isSafeInteger((parsed as Partial<CursorPayload>).o) ||
		((parsed as Partial<CursorPayload>).o ?? -1) < 0
	) {
		throw new InvalidCursorError();
	}
	return (parsed as CursorPayload).o;
}

export function jsonByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
