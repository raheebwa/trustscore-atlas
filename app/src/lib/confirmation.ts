// SPDX-License-Identifier: Apache-2.0
function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createConfirmationToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return hex(bytes);
}

export async function hashConfirmationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return hex(new Uint8Array(digest));
}
