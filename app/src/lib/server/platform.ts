import { error } from '@sveltejs/kit';

/** Reads the D1 binding from event.platform, failing loudly (server-side) rather than with a null-pointer error deep in a query. */
export function requireDb(platform: App.Platform | undefined): D1Database {
	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database binding is not configured for this environment.');
	}
	return db;
}
