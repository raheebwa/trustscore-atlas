// SPDX-License-Identifier: Apache-2.0
export interface InputProperty {
	type?: string;
	description?: string;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	maxLength?: number;
	format?: string;
}

export interface InputSchema {
	type: 'object';
	properties: Record<string, InputProperty>;
	required: string[];
}

const EMPTY_SCHEMA: InputSchema = { type: 'object', properties: {}, required: [] };

export function normaliseInputSchema(value: unknown): InputSchema {
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value) as unknown;
		} catch {
			return EMPTY_SCHEMA;
		}
	}
	if (!parsed || typeof parsed !== 'object') return EMPTY_SCHEMA;
	const candidate = parsed as {
		type?: unknown;
		properties?: unknown;
		required?: unknown;
	};
	const properties =
		candidate.properties && typeof candidate.properties === 'object'
			? (candidate.properties as Record<string, InputProperty>)
			: {};
	const required = Array.isArray(candidate.required)
		? candidate.required.filter((item): item is string => typeof item === 'string')
		: [];
	return { type: 'object', properties, required };
}

export function valuesToArguments(
	schema: InputSchema,
	values: Record<string, string | boolean>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [name, property] of Object.entries(schema.properties)) {
		const value = values[name];
		if (property.type === 'boolean') {
			if (value === true) result[name] = true;
			continue;
		}
		if (typeof value !== 'string' || value === '') continue;
		if (property.type === 'number' || property.type === 'integer') {
			const numberValue = Number(value);
			if (Number.isFinite(numberValue)) result[name] = numberValue;
			continue;
		}
		result[name] = value;
	}
	return result;
}

export function formatExecutionResult(value: string): string {
	try {
		return JSON.stringify(JSON.parse(value) as unknown, null, 2);
	} catch {
		return JSON.stringify({ result: value }, null, 2);
	}
}
