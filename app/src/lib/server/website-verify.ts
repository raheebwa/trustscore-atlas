// SPDX-License-Identifier: Apache-2.0
/**
 * Manages server-side request forgery and unbounded reads against a stranger's URL: a claimant
 * hands us a website and we fetch it, so every check here exists to keep that fetch from reaching
 * somewhere it should not or reading more than it should.
 *
 * What this layer cannot do: it inspects the hostname, not the address it resolves to. A public
 * name that resolves to a private address still passes, because the runtime gives no way to pin
 * the resolved IP. The Worker has no private network to reach, which is what makes that
 * acceptable here; on a host with one, this needs address-level checks as well.
 */

type VerificationOutcome =
	| 'insecure_scheme'
	| 'invalid_host'
	| 'attempts_exhausted'
	| 'redirect_not_followed'
	| 'unsupported_content_type'
	| 'body_too_large'
	| 'string_not_found'
	| 'verification_timeout'
	| 'unreachable';

type VerificationResult =
	| { ok: true; probe: 'well_known' | 'meta_tag'; host: string }
	| { ok: false; outcome: VerificationOutcome };

const BODY_LIMIT = 512 * 1024;
const USER_AGENT = 'TrustScoreAtlasVerifier/1.0 (+https://atlas.trustscorehq.com/methodology)';
const DNS_NAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function hasValidHost(url: URL): boolean {
	const host = url.hostname.toLowerCase();
	if (url.protocol !== 'https:' || url.username || url.password) return false;
	if (url.port && url.port !== '443') return false;
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
	if (
		host === 'localhost' ||
		host.endsWith('.local') ||
		host.endsWith('.internal') ||
		host.endsWith('.localhost')
	)
		return false;
	return DNS_NAME.test(host);
}

function failure(outcome: VerificationOutcome): VerificationResult {
	return { ok: false, outcome };
}

function isTimeout(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		(error.name === 'AbortError' || error.name === 'TimeoutError')
	);
}

async function fetchOnce(fetchImpl: typeof fetch, url: string): Promise<Response> {
	return fetchImpl(url, {
		redirect: 'manual',
		signal: AbortSignal.timeout(5000),
		headers: { 'user-agent': USER_AGENT }
	});
}

async function fetchWithRedirect(
	fetchImpl: typeof fetch,
	url: string,
	originalHost: string
): Promise<Response | VerificationResult> {
	let response = await fetchOnce(fetchImpl, url);
	if (response.status < 300 || response.status >= 400) return response;

	const location = response.headers.get('location');
	let redirect: URL;
	try {
		redirect = new URL(location ?? '', url);
	} catch {
		return failure('redirect_not_followed');
	}
	if (!location || !hasValidHost(redirect) || redirect.hostname !== originalHost) {
		return failure('redirect_not_followed');
	}

	response = await fetchOnce(fetchImpl, redirect.href);
	if (response.status >= 300 && response.status < 400) return failure('redirect_not_followed');
	return response;
}

async function readText(response: Response): Promise<string | VerificationResult> {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (!contentType.startsWith('text/plain') && !contentType.startsWith('text/html')) {
		return failure('unsupported_content_type');
	}
	if (!response.body) return '';

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size >= BODY_LIMIT) {
			try {
				await reader.cancel();
			} catch {
				// The size outcome is authoritative even when upstream cancellation fails.
			}
			return failure('body_too_large');
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function hasMetaChallenge(text: string, challengeValue: string): boolean {
	for (const match of text.matchAll(/<meta\b[^>]*>/gi)) {
		let name: string | undefined;
		let content: string | undefined;
		for (const attribute of match[0].matchAll(/\b(name|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
			const value = attribute[2] ?? attribute[3] ?? '';
			if (attribute[1].toLowerCase() === 'name') name = value;
			else content = value;
		}
		if (name?.toLowerCase() === 'atlas-claim' && content === challengeValue) return true;
	}
	return false;
}

export async function verifyWebsiteString({
	url,
	challengeValue,
	attempts,
	fetchImpl = globalThis.fetch
}: {
	url: string;
	challengeValue: string;
	attempts: number;
	fetchImpl?: typeof fetch;
}): Promise<VerificationResult> {
	if (attempts >= 5) return failure('attempts_exhausted');

	let claimedUrl: URL;
	try {
		claimedUrl = new URL(url);
	} catch {
		return failure('invalid_host');
	}
	if (claimedUrl.protocol !== 'https:') return failure('insecure_scheme');
	if (!hasValidHost(claimedUrl)) return failure('invalid_host');

	const host = claimedUrl.hostname;
	const probes = [
		{ probe: 'well_known' as const, url: `https://${host}/.well-known/atlas-claim.txt` },
		{ probe: 'meta_tag' as const, url: claimedUrl.href }
	];
	try {
		for (const probe of probes) {
			const response = await fetchWithRedirect(fetchImpl, probe.url, host);
			if (!(response instanceof Response)) return response;
			const text = await readText(response);
			if (typeof text !== 'string') return text;
			const matches =
				probe.probe === 'well_known'
					? text.trim() === challengeValue
					: hasMetaChallenge(text, challengeValue);
			if (matches) return { ok: true, probe: probe.probe, host };
		}
		return failure('string_not_found');
	} catch (error) {
		return failure(isTimeout(error) ? 'verification_timeout' : 'unreachable');
	}
}
