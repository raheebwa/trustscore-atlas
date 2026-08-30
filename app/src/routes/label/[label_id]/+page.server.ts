// SPDX-License-Identifier: Apache-2.0
import { getDatabase } from '$lib/server/platform';
import { loadWriteConfirmation } from '$lib/server/write-confirmation';
import type { PageServerLoad } from './$types';

interface LabelRecord extends Record<string, unknown> {
	label_id: string;
	atlas_id: string;
	candidate_atlas_id: string;
	verdict: string;
	requested_at: string;
	status: string;
	expires_at: string;
}

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const token = url.searchParams.get('token');
	if (!token) return { confirmation: { state: 'invalid' as const, record: null, token: null } };
	const db = getDatabase(platform, 'linkage_labels');
	return {
		confirmation: await loadWriteConfirmation<LabelRecord>(
			db,
			'linkage_label',
			params.label_id,
			token
		)
	};
};
