export interface RankableStatement {
	value: string;
	precedence: number;
	source_record_id: string;
	asserted_at: string;
}

function normaliseValue(value: string): string {
	return value
		.toUpperCase()
		.replace(/&/g, ' AND ')
		.replace(/[^A-Z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\bLIMITED\b/g, 'LTD');
}

interface ValueRank {
	value: string;
	precedence: number;
	support: number;
	assertedAt: string;
	normalisedLength: number;
}

/** Returns distinct raw statement values in the serving contract's total order. */
export function rankValues(statements: readonly RankableStatement[]): string[] {
	const grouped = new Map<
		string,
		{
			precedence: number;
			sourceRecordIds: Set<string>;
			assertedAt: string;
		}
	>();

	for (const statement of statements) {
		const current = grouped.get(statement.value);
		if (!current) {
			grouped.set(statement.value, {
				precedence: statement.precedence,
				sourceRecordIds: new Set([statement.source_record_id]),
				assertedAt: statement.asserted_at
			});
			continue;
		}

		current.precedence = Math.min(current.precedence, statement.precedence);
		current.sourceRecordIds.add(statement.source_record_id);
		if (statement.asserted_at > current.assertedAt) current.assertedAt = statement.asserted_at;
	}

	const ranks: ValueRank[] = Array.from(grouped, ([value, rank]) => ({
		value,
		precedence: rank.precedence,
		support: rank.sourceRecordIds.size,
		assertedAt: rank.assertedAt,
		normalisedLength: normaliseValue(value).length
	}));

	ranks.sort((left, right) => {
		if (left.precedence !== right.precedence) return left.precedence - right.precedence;
		if (left.support !== right.support) return right.support - left.support;
		if (left.assertedAt !== right.assertedAt) return left.assertedAt > right.assertedAt ? -1 : 1;
		if (left.normalisedLength !== right.normalisedLength) {
			return left.normalisedLength - right.normalisedLength;
		}
		if (left.value === right.value) return 0;
		return left.value < right.value ? -1 : 1;
	});

	return ranks.map((rank) => rank.value);
}
