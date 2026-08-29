import { error } from '@sveltejs/kit';

export interface AtlasDatabases {
	db: D1Database;
	statementsDb: D1Database;
}

function requireBinding(
	platform: App.Platform | undefined,
	binding: 'DB' | 'DB_STATEMENTS'
): D1Database {
	const db = platform?.env?.[binding];
	if (!db) {
		throw error(500, 'A database binding is not configured for this environment.');
	}
	return db;
}

/** Resolves statement-owned tables to their database and all other tables to the main database. */
export function getDatabase(platform: App.Platform | undefined, table: string): D1Database {
	return table === 'statements' || table === 'refs'
		? requireBinding(platform, 'DB_STATEMENTS')
		: requireBinding(platform, 'DB');
}

/** Reads both serving bindings for request paths that combine main and statement data. */
export function requireDatabases(platform: App.Platform | undefined): AtlasDatabases {
	return {
		db: getDatabase(platform, 'businesses'),
		statementsDb: getDatabase(platform, 'statements')
	};
}
