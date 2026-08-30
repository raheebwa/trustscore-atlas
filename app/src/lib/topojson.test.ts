import { describe, expect, it } from 'vitest';
import { decodeTopology, projectRing, type Topology } from './topojson';

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
