// SPDX-License-Identifier: Apache-2.0
/**
 * A register that lists one business many times (a customs agent with one row per licence,
 * a manufacturer with one row per certified product) asserts the same value many times on
 * the same day. The trace shows one row per distinct (value, source, date, precedence) with
 * a count; the individual source records stay reachable underneath.
 */

import type { StatementRow } from './types';

export interface StatementGroup {
	key: string;
	statement: StatementRow;
	count: number;
	records: StatementRow[];
	isWinner: boolean;
}

export function groupKey(
	row: Pick<StatementRow, 'value' | 'source' | 'asserted_at' | 'precedence'>
): string {
	return [row.value, row.source, row.asserted_at, String(row.precedence)].join(' ');
}

export function groupStatements(
	statements: StatementRow[],
	winnerStatementId: string | null
): StatementGroup[] {
	const groups = new Map<string, StatementGroup>();
	for (const row of statements) {
		const key = groupKey(row);
		const existing = groups.get(key);
		if (existing) {
			existing.count += 1;
			existing.records.push(row);
			if (row.statement_id === winnerStatementId) {
				existing.statement = row;
				existing.isWinner = true;
			}
			continue;
		}
		groups.set(key, {
			key,
			statement: row,
			count: 1,
			records: [row],
			isWinner: row.statement_id === winnerStatementId
		});
	}
	return [...groups.values()];
}
