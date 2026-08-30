// SPDX-License-Identifier: Apache-2.0
/**
 * What a verification mail says. One wording, wherever the link was asked for, so the message a
 * claimant receives never depends on which door they came through.
 */

import type { MailMessage } from './mail';

export function claimVerificationMail(
	to: string,
	origin: string,
	challengeId: string,
	linkToken: string
): MailMessage {
	const link = new URL(
		`/claim/verify/${encodeURIComponent(challengeId)}?token=${encodeURIComponent(linkToken)}`,
		origin
	).href;
	return {
		to,
		subject: 'Confirm your Atlas claim',
		text: [
			'Someone claimed a business record on TrustScore Atlas and asked to confirm that claim from this address.',
			'',
			`Open this link within 30 minutes to confirm it: ${link}`,
			'',
			'The link works once. If you were not expecting this, ignore this message. Nothing changes until the link is opened, and no published record changes until a maintainer approves the claim.'
		].join('\n')
	};
}
