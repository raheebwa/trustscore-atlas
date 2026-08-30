// SPDX-License-Identifier: Apache-2.0
import { error } from '@sveltejs/kit';
import { InvalidCursorError } from '$lib/pagination';
import {
	PRECEDENCE_RANKS,
	RegenerationInProgressError,
	businessExists,
	getFieldTrace
} from '$lib/server/atlas';
import { requireDatabases } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const databases = requireDatabases(platform);
	const exists = await businessExists(databases.db, params.atlas_id);
	if (!exists) {
		error(404, `No business found for atlas_id "${params.atlas_id}".`);
	}

	let trace;
	try {
		trace = await getFieldTrace(databases, params.atlas_id, params.field, {
			cursor: url.searchParams.get('cursor')
		});
	} catch (cause) {
		if (cause instanceof InvalidCursorError) error(400, 'Invalid trace cursor.');
		if (cause instanceof RegenerationInProgressError) {
			error(503, 'Data is being refreshed, try again in a minute.');
		}
		throw cause;
	}
	if (trace.statements.length === 0) {
		error(404, `No statements on file for field "${params.field}" on this business.`);
	}

	return { atlasId: params.atlas_id, trace, precedenceRanks: PRECEDENCE_RANKS };
};
