/**
 * Cloudflare Access guard for the maintainer surface. Access sits in front of /ops and
 * forwards a signed JWT in Cf-Access-Jwt-Assertion; the Worker verifies it against the
 * team's public keys and the application audience. No configuration means no access.
 */

export interface AccessConfig {
	teamDomain: string;
	audience: string;
}

export interface AccessIdentity {
	email: string;
}

export type CertsFetcher = (url: string) => Promise<{ keys: JsonWebKey[] }>;

const HEADER = 'Cf-Access-Jwt-Assertion';

export function accessConfigFrom(env: Record<string, unknown> | undefined): AccessConfig | null {
	const teamDomain = env?.ACCESS_TEAM_DOMAIN;
	const audience = env?.ACCESS_AUD;
	if (typeof teamDomain !== 'string' || typeof audience !== 'string') return null;
	if (!teamDomain.trim() || !audience.trim()) return null;
	return { teamDomain: teamDomain.trim().replace(/^https?:\/\//, ''), audience: audience.trim() };
}

async function defaultFetchCerts(url: string): Promise<{ keys: JsonWebKey[] }> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`certs ${response.status}`);
	return (await response.json()) as { keys: JsonWebKey[] };
}

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> {
	const padded =
		segment.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (segment.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function decodeJson(segment: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeSegment(segment)));
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export async function verifyAccessRequest(
	request: Request,
	config: AccessConfig | null,
	fetchCerts: CertsFetcher = defaultFetchCerts
): Promise<AccessIdentity | null> {
	if (!config) return null;
	const jwt = request.headers.get(HEADER);
	if (!jwt) return null;
	const parts = jwt.split('.');
	if (parts.length !== 3) return null;
	const header = decodeJson(parts[0]);
	const payload = decodeJson(parts[1]);
	if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

	let keys: JsonWebKey[];
	try {
		keys = (await fetchCerts(`https://${config.teamDomain}/cdn-cgi/access/certs`)).keys ?? [];
	} catch {
		return null;
	}
	const jwk = keys.find((key) => (key as { kid?: string }).kid === header.kid);
	if (!jwk) return null;

	let verified: boolean;
	try {
		const key = await crypto.subtle.importKey(
			'jwk',
			jwk,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['verify']
		);
		verified = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			key,
			decodeSegment(parts[2]),
			new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
		);
	} catch {
		return null;
	}
	if (!verified) return null;

	const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
	if (!audiences.includes(config.audience)) return null;
	if (payload.iss !== `https://${config.teamDomain}`) return null;
	const now = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
	if (typeof payload.email !== 'string' || !payload.email) return null;
	return { email: payload.email };
}
