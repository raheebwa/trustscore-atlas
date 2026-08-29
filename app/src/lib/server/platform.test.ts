import { describe, expect, it } from 'vitest';
import { getDatabase, requireDatabases } from './platform';

describe('database resolver', () => {
	it('maps statements and refs to DB_STATEMENTS and every other table to DB', () => {
		const db = {} as D1Database;
		const statementsDb = {} as D1Database;
		const platform = {
			env: { DB: db, DB_STATEMENTS: statementsDb }
		} as unknown as App.Platform;

		expect(getDatabase(platform, 'statements')).toBe(statementsDb);
		expect(getDatabase(platform, 'refs')).toBe(statementsDb);
		expect(getDatabase(platform, 'businesses')).toBe(db);
		expect(getDatabase(platform, 'scores')).toBe(db);
		expect(requireDatabases(platform)).toEqual({ db, statementsDb });
	});
});
