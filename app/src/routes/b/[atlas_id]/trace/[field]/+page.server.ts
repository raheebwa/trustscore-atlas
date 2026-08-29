import { error } from '@sveltejs/kit';
import { PRECEDENCE_RANKS, businessExists, getFieldTrace } from '$lib/server/atlas';
import { requireDb } from '$lib/server/platform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const db = requireDb(platform);
	const exists = await businessExists(db, params.atlas_id);
	if (!exists) {
		error(404, `No business found for atlas_id "${params.atlas_id}".`);
	}

	const trace = await getFieldTrace(db, params.atlas_id, params.field);
	if (trace.statements.length === 0) {
		error(404, `No statements on file for field "${params.field}" on this business.`);
	}

	return { atlasId: params.atlas_id, trace, precedenceRanks: PRECEDENCE_RANKS };
};
