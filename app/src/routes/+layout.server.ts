// SPDX-License-Identifier: Apache-2.0
/**
 * What the shell needs on every route: the loaded country packs behind the header switch, the
 * country in scope, and the live regeneration for the footer line.
 *
 * The country comes from the record on a record's own pages, because a record belongs to one
 * pack and is addressed by its own id. Everywhere else it comes from the URL first so a shared
 * link always opens on the country it was shared for, then from the visitor's last choice, then
 * from the largest pack. Nothing in the interface names a country in copy; adding a pack changes
 * these numbers, not any sentence.
 */

import { getLiveRegenerationId, getSources } from '$lib/server/atlas';
import { deploymentVersion } from '$lib/server/cache-scope';
import { listPacksCached, resolveScopeCountry } from '$lib/server/packs';
import { envValue, requireDatabases } from '$lib/server/platform';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, platform, url }) => {
	const databases = requireDatabases(platform);
	const version = deploymentVersion(platform?.env as Record<string, unknown> | undefined);
	const [packs, regeneration, sources] = await Promise.all([
		listPacksCached(databases, platform?.env?.CACHE, version),
		getLiveRegenerationId(databases.db),
		getSources(databases.db)
	]);
	const { country, fromRecord } = await resolveScopeCountry(databases, platform?.env?.CACHE, {
		pathname: url.pathname,
		requested: url.searchParams.get('country'),
		remembered: cookies.get('country'),
		versionId: version
	});
	// A country chosen in the URL becomes the visitor's default for a year; a link shared with
	// ?country= still wins for whoever opens it. A record moves the scope the same way, so a
	// reader who opens a Ugandan record leaves scoped to Uganda rather than to what they had.
	if ((fromRecord || url.searchParams.get('country')) && cookies.get('country') !== country) {
		cookies.set('country', country, {
			path: '/',
			maxAge: 31536000,
			sameSite: 'lax',
			httpOnly: false
		});
	}
	const pack = packs.find((entry) => entry.code === country);
	return {
		// Public by design: the widget in the page is what it is for. Absent on a deployment that
		// sets none, which is what leaves those pages ungated on both sides.
		turnstileSiteKey: envValue(platform, 'TURNSTILE_SITE_KEY') ?? null,
		packs,
		country,
		countryName: pack?.name ?? country,
		// How many of this pack's registers have actually been loaded: the number every scope
		// line quotes, so no page has to count it again.
		registersLoaded: sources.filter(
			(source) => source.country === country && source.status !== 'not_loaded'
		).length,
		regeneration
	};
};
