import { getDatabase } from '$lib/server/platform';
import { loadWriteConfirmation } from '$lib/server/write-confirmation';
import type { PageServerLoad } from './$types';

interface CorrectionRecord extends Record<string, unknown> {
	correction_id: string;
	atlas_id: string;
	field: string;
	value: string;
	evidence_url: string;
	requested_at: string;
	status: string;
	expires_at: string;
}

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const token = url.searchParams.get('token');
	if (!token) return { confirmation: { state: 'invalid' as const, record: null, token: null } };
	const db = getDatabase(platform, 'corrections');
	return {
		confirmation: await loadWriteConfirmation<CorrectionRecord>(
			db,
			'correction',
			params.correction_id,
			token
		)
	};
};
