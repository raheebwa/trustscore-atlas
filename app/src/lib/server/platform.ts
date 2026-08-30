import { error } from '@sveltejs/kit';

export interface AtlasDatabases {
	db: D1Database;
	statementsDb: D1Database;
	scoresDb: D1Database;
	coverageMetadata?: Promise<CoverageMetadata>;
	locationPublishingCountries?: Promise<Set<string>>;
}

export interface CoverageLists {
	applicable: string[];
	checked: string[];
}

/** Pack-wide register lists: the default (first pack) plus one entry per country code. */
export interface CoverageMetadata extends CoverageLists {
	byCountry: Record<string, CoverageLists>;
}

function requireBinding(
	platform: App.Platform | undefined,
	binding: 'DB' | 'DB_STATEMENTS' | 'DB_SCORES'
): D1Database {
	const db = platform?.env?.[binding];
	if (!db) {
		throw error(500, 'A database binding is not configured for this environment.');
	}
	return db;
}

/** Resolves tables owned by a dedicated serving database and defaults to the main database. */
export function getDatabase(platform: App.Platform | undefined, table: string): D1Database {
	if (table === 'statements' || table === 'refs') {
		return requireBinding(platform, 'DB_STATEMENTS');
	}
	if (table === 'scores') return requireBinding(platform, 'DB_SCORES');
	return requireBinding(platform, 'DB');
}

/** Reads all serving bindings for request paths that may combine databases. */
export function requireDatabases(platform: App.Platform | undefined): AtlasDatabases {
	return {
		db: getDatabase(platform, 'businesses'),
		statementsDb: getDatabase(platform, 'statements'),
		scoresDb: getDatabase(platform, 'scores')
	};
}

/** The R2 bucket holding published bundles and raw pulls. */
export function requireBucket(platform: App.Platform | undefined): R2Bucket {
	const bucket = platform?.env?.DATA;
	if (!bucket) error(500, 'Data bucket is not configured.');
	return bucket;
}
