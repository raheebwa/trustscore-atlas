import { error } from '@sveltejs/kit';
import { accessConfigFrom, verifyAccessRequest } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

/** Every /ops screen sits behind Cloudflare Access; without a verified identity there is no page. */
export const load: LayoutServerLoad = async ({ platform, request }) => {
	const config = accessConfigFrom(platform?.env as Record<string, unknown> | undefined);
	if (!config) error(403, 'The maintainer surface is not configured on this deployment.');
	const identity = await verifyAccessRequest(request, config);
	if (!identity) error(403, 'Maintainer access required.');
	return { maintainer: identity.email };
};
