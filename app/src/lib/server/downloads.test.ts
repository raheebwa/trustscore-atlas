import { describe, expect, it } from 'vitest';
import { getDownloads, resolveDownloadKey } from './downloads';

const datapackage = {
	name: 'trustscore-atlas-20260830T030202Z',
	version: '20260830T030202Z',
	created: '2026-08-30T03:30:00Z',
	licenses: [{ name: 'CC-BY-4.0', path: 'https://creativecommons.org/licenses/by/4.0/' }],
	sources: [
		{ title: 'Kampala Capital City Authority: Businesses', path: 'https://example.invalid/kcca' }
	],
	resources: [
		{
			name: 'canonical-businesses-parquet',
			path: 'canonical/businesses.parquet',
			format: 'parquet',
			mediatype: 'application/vnd.apache.parquet',
			bytes: 6091721,
			hash: 'sha256:abc',
			licenses: [{ name: 'CC-BY-4.0' }],
			description: 'One row per business.'
		},
		{
			name: 'source-kcca-businesses-records-parquet',
			path: 'sources/kcca.businesses/records.parquet',
			format: 'parquet',
			mediatype: 'application/vnd.apache.parquet',
			bytes: 1200,
			hash: 'sha256:def',
			licenses: [{ name: 'public-record' }]
		}
	]
};

function bucket(objects: Record<string, string>): R2Bucket {
	return {
		get: async (key: string) => {
			const body = objects[key];
			if (body === undefined) return null;
			return {
				key,
				size: body.length,
				text: async () => body,
				json: async () => JSON.parse(body)
			};
		}
	} as unknown as R2Bucket;
}

describe('getDownloads', () => {
	it('reads the latest pointer and its data package, grouping canonical and per-source files', async () => {
		const data = bucket({
			'bundles/latest.json': JSON.stringify({ regeneration_id: '20260830T030202Z' }),
			'bundles/20260830T030202Z/datapackage.json': JSON.stringify(datapackage)
		});
		const downloads = await getDownloads(data);
		expect(downloads?.regeneration_id).toBe('20260830T030202Z');
		expect(downloads?.canonical.map((r) => r.name)).toEqual(['canonical-businesses-parquet']);
		expect(downloads?.sources.map((r) => r.path)).toEqual([
			'sources/kcca.businesses/records.parquet'
		]);
		expect(downloads?.canonical[0].href).toBe(
			'/downloads/20260830T030202Z/canonical/businesses.parquet'
		);
		expect(downloads?.total_bytes).toBe(6091721 + 1200);
		expect(downloads?.extras.map((e) => e.path)).toEqual([
			'datapackage.json',
			'LICENSE',
			'SOURCES.md',
			'manifest.json'
		]);
	});

	it('returns null when nothing has been published', async () => {
		expect(await getDownloads(bucket({}))).toBeNull();
	});
});

describe('resolveDownloadKey', () => {
	it('maps a regeneration id and a relative path to the bundle key and rejects escapes', () => {
		expect(resolveDownloadKey('20260830T030202Z', 'canonical/businesses.parquet')).toBe(
			'bundles/20260830T030202Z/canonical/businesses.parquet'
		);
		expect(resolveDownloadKey('20260830T030202Z', '../secret')).toBeNull();
		expect(resolveDownloadKey('not an id', 'LICENSE')).toBeNull();
		expect(resolveDownloadKey('20260830T030202Z', 'canonical//x')).toBeNull();
	});
});
