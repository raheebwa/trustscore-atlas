// SPDX-License-Identifier: Apache-2.0
/**
 * What the shell needs on every route: the loaded country packs behind the header switch, the
 * country in scope, and the live regeneration for the footer line.
 *
 * The country comes from the URL first so a shared link always opens on the country it was
 * shared for, then from the visitor's last choice, then from the largest pack. Nothing in the
 * interface names a country in copy; adding a pack changes these numbers, not any sentence.
 */

import { getLiveRegenerationId } from '$lib/server/atlas';
import { deploymentVersion } from '$lib/server/cache-scope';
import { listPacksCached, type Pack } from '$lib/server/packs';
import { requireDatabases } from '$lib/server/platform';
import type { LayoutServerLoad } from './$types';

function chooseCountry(
	packs: Pack[],
	requested: string | null,
	remembered: string | undefined
): string {
	const codes = new Set(packs.map((pack) => pack.code));
	for (const candidate of [requested, remembered]) {
		const code = candidate?.trim().toUpperCase();
		if (code && codes.has(code)) return code;
	}
	return packs[0]?.code ?? 'UG';
}

export const load: LayoutServerLoad = async ({ cookies, platform, url }) => {
	const databases = requireDatabases(platform);
	const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
	const [packs, regeneration] = await Promise.all([
		listPacksCached(databases, platform?.env?.CACHE, version),
		getLiveRegenerationId(databases.db)
	]);
	const country = chooseCountry(packs, url.searchParams.get('country'), cookies.get('country'));
	// A country chosen in the URL becomes the visitor's default for a year; a link shared with
	// ?country= still wins for whoever opens it.
	if (url.searchParams.get('country') && cookies.get('country') !== country) {
		cookies.set('country', country, {
			path: '/',
			maxAge: 31536000,
			sameSite: 'lax',
			httpOnly: false
		});
	}
	return { packs, country, regeneration };
};
