import { json } from '@sveltejs/kit';

const WRITE_PAGE_PREFIXES = ['/claim/', '/correct/', '/label/', '/report/'] as const;

export function isRateLimitedPath(pathname: string): boolean {
	return (
		pathname === '/api/v1' ||
		pathname.startsWith('/api/v1/') ||
		WRITE_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

export async function applyRequestRateLimit(
	request: Request,
	url: URL,
	platform: App.Platform | undefined,
	next: () => Response | Promise<Response>
): Promise<Response> {
	if (!isRateLimitedPath(url.pathname)) return next();
	const limiter = platform?.env?.API_LIMITER;
	if (!limiter) return json({ error: 'rate_limit_unavailable' }, { status: 503 });

	const clientIp = request.headers.get('CF-Connecting-IP') || 'unavailable';
	let success: boolean;
	try {
		({ success } = await limiter.limit({ key: clientIp }));
	} catch {
		return json({ error: 'rate_limit_unavailable' }, { status: 503 });
	}
	if (!success) {
		return json(
			{ error: 'rate_limit_exceeded' },
			{ status: 429, headers: { 'Retry-After': '60' } }
		);
	}
	return next();
}
