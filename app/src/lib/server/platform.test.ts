// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { getDatabase, requireDatabases } from './platform';

describe('database resolver', () => {
	it('maps statement and score tables to their dedicated bindings', () => {
		const db = {} as D1Database;
		const statementsDb = {} as D1Database;
		const scoresDb = {} as D1Database;
		const platform = {
			env: { DB: db, DB_STATEMENTS: statementsDb, DB_SCORES: scoresDb }
		} as unknown as App.Platform;

		expect(getDatabase(platform, 'statements')).toBe(statementsDb);
		expect(getDatabase(platform, 'refs')).toBe(statementsDb);
		expect(getDatabase(platform, 'businesses')).toBe(db);
		expect(getDatabase(platform, 'scores')).toBe(scoresDb);
		expect(requireDatabases(platform)).toEqual({ db, statementsDb, scoresDb });
	});
});
