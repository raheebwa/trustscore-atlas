// SPDX-License-Identifier: Apache-2.0
/**
 * Sending one message to one address, over Resend.
 *
 * A claimant's email address is the most sensitive thing this application handles: it is the only
 * personal detail in the whole flow. So nothing here writes it anywhere. The provider's own reply
 * is not passed back either, because it quotes the address and its own account state; a caller
 * learns whether the message went, and one word about why not.
 */

const ENDPOINT = 'https://api.resend.com/emails';
/**
 * Resend refuses a direct HTTP call that carries no user agent with a 403, and its own SDKs set
 * one for you. Sending it is the difference between mail that goes and mail that silently does
 * not: https://resend.com/docs/knowledge-base/403-error-1010
 */
const USER_AGENT = 'TrustScoreAtlas/1.0 (+https://atlas.trustscorehq.com)';

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

export type MailResult = { sent: true } | { sent: false; reason: 'refused' | 'unreachable' };

export interface Mailer {
	send(message: MailMessage): Promise<MailResult>;
}

/**
 * The mailer, or null when this deployment has no mail configured. Null is a normal state rather
 * than an error: a deployment without a key still records claims and still verifies websites.
 */
export function resendMailer({
	apiKey,
	from,
	fetchImpl = globalThis.fetch
}: {
	apiKey: string | undefined;
	from: string | undefined;
	fetchImpl?: typeof fetch;
}): Mailer | null {
	if (!apiKey?.trim() || !from?.trim()) return null;

	return {
		async send(message: MailMessage): Promise<MailResult> {
			try {
				const response = await fetchImpl(ENDPOINT, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${apiKey.trim()}`,
						'content-type': 'application/json',
						'user-agent': USER_AGENT
					},
					body: JSON.stringify({
						from: from.trim(),
						to: [message.to],
						subject: message.subject,
						text: message.text
					}),
					signal: AbortSignal.timeout(10000)
				});
				if (response.ok) return { sent: true };
				// The provider's reply quotes the address, so only its status is ever recorded.
				console.error(JSON.stringify({ message: 'mail refused', status: response.status }));
				return { sent: false, reason: 'refused' };
			} catch {
				console.error(JSON.stringify({ message: 'mail unreachable' }));
				return { sent: false, reason: 'unreachable' };
			}
		}
	};
}
