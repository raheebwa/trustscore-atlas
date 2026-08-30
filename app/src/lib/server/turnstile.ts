// SPDX-License-Identifier: Apache-2.0
/**
 * The check in front of the page forms.
 *
 * It is here to stop a script filing thousands of claims, not to stop a person, so it fails in the
 * directions that suit that: a deployment with no secret configured is not gated at all, which
 * keeps a fork and a local checkout working, while a configured one refuses anything without a
 * solved challenge, including when the provider cannot be reached. What the provider said is never
 * passed back to whoever submitted the form: they can only be told the check did not pass.
 */

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
	ok: boolean;
	/** Whether a check happened at all, which is false on a deployment with no secret. */
	checked: boolean;
}

export async function verifyTurnstile({
	secret,
	token,
	remoteIp,
	fetchImpl = globalThis.fetch
}: {
	secret: string | undefined;
	token: string | null;
	remoteIp?: string | null;
	fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
	if (!secret?.trim()) return { ok: true, checked: false };
	if (!token?.trim()) return { ok: false, checked: true };

	const body = new URLSearchParams({ secret: secret.trim(), response: token.trim() });
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const response = await fetchImpl(ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok) return { ok: false, checked: true };
		const verdict = (await response.json()) as { success?: unknown };
		return { ok: verdict.success === true, checked: true };
	} catch {
		return { ok: false, checked: true };
	}
}
