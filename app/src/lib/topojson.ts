// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal TopoJSON reader for the boundaries pack: decodes quantized,
 * delta-encoded arcs into longitude/latitude rings and projects them into an
 * SVG view box. Only what the explorer map needs; no library.
 */

export type Point = [number, number];

export interface Topology {
	type: string;
	transform?: { scale: [number, number]; translate: [number, number] };
	arcs: number[][][];
	objects: Record<
		string,
		{
			type: string;
			geometries: {
				type: string;
				properties?: Record<string, unknown>;
				arcs?: unknown;
			}[];
		}
	>;
}

export interface BoundaryFeature {
	pcode: string | null;
	name: string | null;
	rings: Point[][];
}

export interface Bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

function decodeArcs(topology: Topology): Point[][] {
	const scale = topology.transform?.scale ?? [1, 1];
	const translate = topology.transform?.translate ?? [0, 0];
	return topology.arcs.map((arc) => {
		let x = 0;
		let y = 0;
		return arc.map(([dx, dy]) => {
			x += dx;
			y += dy;
			return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as Point;
		});
	});
}

function ringFromArcs(arcRefs: number[], arcs: Point[][]): Point[] {
	const ring: Point[] = [];
	for (const ref of arcRefs) {
		const points = ref < 0 ? [...arcs[~ref]].reverse() : arcs[ref];
		ring.push(...(ring.length > 0 ? points.slice(1) : points));
	}
	return ring;
}

function propertyString(properties: Record<string, unknown> | undefined, key: string) {
	const value = properties?.[key];
	const trimmed = typeof value === 'string' ? value.trim() : '';
	return trimmed || null;
}

/**
 * Key for matching a register's district spelling to a boundary name: case, spacing,
 * punctuation and a trailing "district" are ignored. Genuine misspellings are not.
 */
export function districtKey(name: string | null | undefined): string {
	return (name ?? '')
		.toLowerCase()
		.replace(/\bdistrict\b/g, '')
		.replace(/[^a-z]/g, '');
}

export function decodeTopology(topology: Topology, objectName: string): BoundaryFeature[] {
	const arcs = decodeArcs(topology);
	const object = topology.objects[objectName];
	if (!object) return [];
	return object.geometries.map((geometry) => {
		const rings: Point[][] = [];
		if (geometry.type === 'Polygon') {
			for (const ring of geometry.arcs as number[][]) rings.push(ringFromArcs(ring, arcs));
		} else if (geometry.type === 'MultiPolygon') {
			for (const polygon of geometry.arcs as number[][][]) {
				for (const ring of polygon) rings.push(ringFromArcs(ring, arcs));
			}
		}
		return {
			pcode: propertyString(geometry.properties, 'pcode'),
			name: propertyString(geometry.properties, 'name'),
			rings
		};
	});
}

export function boundsOf(features: BoundaryFeature[]): Bounds {
	const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
	for (const feature of features) {
		for (const ring of feature.rings) {
			for (const [x, y] of ring) {
				bounds.minX = Math.min(bounds.minX, x);
				bounds.maxX = Math.max(bounds.maxX, x);
				bounds.minY = Math.min(bounds.minY, y);
				bounds.maxY = Math.max(bounds.maxY, y);
			}
		}
	}
	return bounds;
}

/** Equirectangular projection into a square view box of `size`, north up. */
export function projectRing(ring: Point[], bounds: Bounds, size: number): string {
	const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
	const k = size / span;
	const format = (value: number) => String(+value.toFixed(1));
	return (
		ring
			.map(([x, y], index) => {
				const px = format((x - bounds.minX) * k);
				const py = format((bounds.maxY - y) * k);
				return `${index === 0 ? 'M' : 'L'}${px},${py}`;
			})
			.join('') + 'Z'
	);
}
