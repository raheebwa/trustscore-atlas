// SPDX-License-Identifier: Apache-2.0
import { getDatabase } from '$lib/server/platform';
import { loadWriteConfirmation } from '$lib/server/write-confirmation';
import type { PageServerLoad } from './$types';

interface IssueRecord extends Record<string, unknown> {
	issue_id: string;
	atlas_id: string | null;
	source: string | null;
	description: string;
	requested_at: string;
	status: string;
	expires_at: string;
}

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const token = url.searchParams.get('token');
	if (!token) return { confirmation: { state: 'invalid' as const, record: null, token: null } };
	const db = getDatabase(platform, 'issues');
	return {
		confirmation: await loadWriteConfirmation<IssueRecord>(db, 'issue', params.issue_id, token)
	};
};
