import { describe, expect, it } from 'vitest';
import { decodeTopology, districtKey, projectRing, type Topology } from './topojson';

const topology: Topology = {
	type: 'Topology',
	transform: { scale: [0.5, 0.5], translate: [10, 20] },
	arcs: [
		[
			[0, 0],
			[2, 0],
			[0, 2]
		],
		[
			[2, 2],
			[-2, 0]
		]
	],
	objects: {
		adm2: {
			type: 'GeometryCollection',
			geometries: [
				{ type: 'Polygon', properties: { pcode: 'UG1', name: 'Alpha' }, arcs: [[0, 1]] },
				{ type: 'MultiPolygon', properties: { pcode: 'UG2', name: 'Beta' }, arcs: [[[-2]]] }
			]
		}
	}
};

describe('decodeTopology', () => {
	it('delta-decodes arcs, applies the transform and reverses negative arc indexes', () => {
		const features = decodeTopology(topology, 'adm2');
		expect(features.map((f) => f.name)).toEqual(['Alpha', 'Beta']);
		expect(features[0].rings).toEqual([
			[
				[10, 20],
				[11, 20],
				[11, 21],
				[10, 21]
			]
		]);
		expect(features[1].rings).toEqual([
			[
				[10, 21],
				[11, 21]
			]
		]);
	});
});

describe('projectRing', () => {
	it('maps longitude and latitude into a view box with north up', () => {
		const bounds = { minX: 10, maxX: 12, minY: 20, maxY: 22 };
		expect(
			projectRing(
				[
					[10, 20],
					[12, 22]
				],
				bounds,
				100
			)
		).toBe('M0,100L100,0Z');
	});
});

describe('the committed district boundaries', () => {
	it('decode into one named ring set per district', async () => {
		const { readFile } = await import('node:fs/promises');
		const raw = await readFile(
			new URL('../../static/boundaries/ug-adm2.topojson', import.meta.url),
			'utf8'
		);
		const features = decodeTopology(JSON.parse(raw), 'adm2');
		expect(features.length).toBe(135);
		expect(features.every((f) => f.name && f.rings.length > 0 && f.rings[0].length > 3)).toBe(true);
		expect(features.map((f) => f.name)).toContain('Kampala');
	});
});

describe('districtKey', () => {
	it('ignores case, spacing, punctuation and a trailing district word', () => {
		expect(districtKey(' Arua District ')).toBe('arua');
		expect(districtKey('Mukono.')).toBe('mukono');
		expect(districtKey('KAMPALA')).toBe(districtKey('Kampala'));
		expect(districtKey(null)).toBe('');
	});
});
