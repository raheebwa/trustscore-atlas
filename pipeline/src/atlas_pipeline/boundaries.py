"""Boundary conversion to TopoJSON."""

from __future__ import annotations

import argparse
import json
import math
import sys
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

Coordinate = tuple[float, float]
Ring = list[Coordinate]
Geometry = list[Ring]
FeatureRecord = tuple[str | None, str | None, list[Geometry]]


def _to_coordinate(value: Any) -> Coordinate:
    try:
        x, y = value
        return (float(x), float(y))
    except (TypeError, ValueError) as error:
        raise TypeError(f"invalid coordinate {value!r}") from error


def _coalesce(points: list[Coordinate]) -> list[Coordinate]:
    if not points:
        return points
    out: list[Coordinate] = [points[0]]
    for point in points[1:]:
        if point != out[-1]:
            out.append(point)
    if len(out) >= 2 and out[0] == out[-1]:
        out = out[:-1]
    return out


def _perpendicular_distance(point: Coordinate, start: Coordinate, end: Coordinate) -> float:
    if start == end:
        return math.dist(point, start)
    x0, y0 = point
    x1, y1 = start
    x2, y2 = end
    return abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / math.dist(start, end)


def _simplify_ring(points: list[Coordinate], tolerance: float) -> list[Coordinate]:
    if len(points) <= 2:
        return points
    if tolerance <= 0:
        out = list(points)
        if out[0] != out[-1]:
            out.append(out[0])
        return out

    closed = points[0] == points[-1]
    if closed:
        points = points[:-1]
    if len(points) < 3:
        return points + [points[0]] if closed else points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True

    def recurse(left: int, right: int) -> None:
        if right <= left + 1:
            return
        first = points[left]
        last = points[right]
        max_distance = -1.0
        max_index = left
        for i in range(left + 1, right):
            distance = _perpendicular_distance(points[i], first, last)
            if distance > max_distance:
                max_distance = distance
                max_index = i
        if max_distance <= tolerance:
            return
        keep[max_index] = True
        recurse(left, max_index)
        recurse(max_index, right)

    recurse(0, len(points) - 1)
    simplified = [point for point, keep_point in zip(points, keep, strict=True) if keep_point]
    if closed and simplified:
        simplified.append(simplified[0])
    return simplified


def _parse_points(raw: list[Any]) -> list[Coordinate]:
    return [_to_coordinate(point) for point in raw]


def _parse_geometry(
    raw_type: str | None, raw_coords: list[Any], tolerance: float
) -> list[Geometry] | None:
    if not raw_type or not raw_coords:
        return None

    if raw_type == "Polygon":
        geometry: list[Geometry] = []
        for ring in raw_coords:
            parsed = _simplify_ring(_coalesce(_parse_points(ring)), tolerance)
            if len(parsed) < 4:
                continue
            if parsed[0] != parsed[-1]:
                parsed.append(parsed[0])
            geometry.append([parsed])
        return geometry if geometry else None

    if raw_type == "MultiPolygon":
        geometry: list[Geometry] = []
        for polygon_raw in raw_coords:
            polygon: Geometry = []
            for ring in polygon_raw:
                parsed = _simplify_ring(_coalesce(_parse_points(ring)), tolerance)
                if len(parsed) < 4:
                    continue
                if parsed[0] != parsed[-1]:
                    parsed.append(parsed[0])
                polygon.append(parsed)
            if polygon:
                geometry.append(polygon)
        return geometry if geometry else None

    return None


def _feature_property_string(values: dict[str, Any], *names: str) -> str | None:
    for name in names:
        if name not in values:
            continue
        raw = values.get(name)
        if raw is None:
            continue
        value = str(raw).strip()
        if value:
            return value
    return None


def _extract_features(features: list[dict[str, Any]], tolerance: float) -> list[FeatureRecord]:
    out: list[FeatureRecord] = []
    for feature in features:
        geometry = feature.get("geometry") or {}
        if not isinstance(geometry, dict):
            continue
        parsed = _parse_geometry(geometry.get("type"), geometry.get("coordinates", []), tolerance)
        if not parsed:
            continue
        props = feature.get("properties")
        if not isinstance(props, dict):
            props = {}
        lowered = {key.lower(): value for key, value in props.items()}
        pcode = _feature_property_string(
            lowered,
            "pcode",
            "adm4_pcode",
            "adm3_pcode",
            "adm2_pcode",
            "adm1_pcode",
            "admin_code",
        )
        name = _feature_property_string(
            lowered,
            "name",
            "adm4_name",
            "adm3_name",
            "adm2_name",
            "adm1_name",
            "admin_name",
        )
        out.append((pcode, name, parsed))
    if not out:
        raise RuntimeError("no supported polygon features in input")
    return out


def _quantize(
    points: list[Coordinate], steps: int
) -> tuple[dict[Coordinate, tuple[int, int]], list[float], list[float]]:
    if not points:
        raise RuntimeError("no geometry coordinates available")
    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    scale_x = (max_x - min_x) / (steps - 1) if max_x > min_x else 1.0
    scale_y = (max_y - min_y) / (steps - 1) if max_y > min_y else 1.0
    lookup: dict[Coordinate, tuple[int, int]] = {}
    for point in points:
        if point not in lookup:
            lookup[point] = (
                round((point[0] - min_x) / scale_x),
                round((point[1] - min_y) / scale_y),
            )
    return lookup, [scale_x, scale_y], [min_x, min_y]


def _encode_delta(points: list[tuple[int, int]]) -> list[int]:
    if not points:
        return []
    out: list[int] = [points[0][0], points[0][1]]
    for previous, current in zip(points[:-1], points[1:], strict=True):
        out.extend([current[0] - previous[0], current[1] - previous[1]])
    return out


def _register_arc(
    points: list[tuple[int, int]],
    arcs: list[list[int]],
    lookup: dict[tuple[tuple[int, int], ...], int],
) -> int:
    forward = tuple(points)
    reverse = tuple(reversed(points))
    if forward in lookup:
        return lookup[forward]
    if reverse in lookup:
        return -lookup[reverse] - 1
    index = len(arcs)
    arcs.append(_encode_delta(points))
    lookup[forward] = index
    return index


def _build_topology(rows: list[FeatureRecord], level: str) -> dict[str, Any]:
    all_points: list[Coordinate] = []
    for _, _, geometry in rows:
        for polygon in geometry:
            for ring in polygon:
                all_points.extend(ring)

    lookup, scale, translate = _quantize(all_points, steps=4096)

    arcs: list[list[int]] = []
    arc_lookup: dict[tuple[tuple[int, int], ...], int] = {}
    geometries: list[dict[str, Any]] = []
    for pcode, name, geometry in rows:
        polygon_arc_refs: list[list[list[int]]] = []
        for polygon in geometry:
            ring_refs: list[list[int]] = []
            for ring in polygon:
                quantized = [lookup[point] for point in ring]
                if len(quantized) < 2:
                    continue
                arcs_for_ring: list[int] = []
                for segment_start, segment_end in zip(quantized, quantized[1:], strict=False):
                    arcs_for_ring.append(
                        _register_arc([segment_start, segment_end], arcs, arc_lookup)
                    )
                if arcs_for_ring:
                    ring_refs.append(arcs_for_ring)
            if ring_refs:
                polygon_arc_refs.append(ring_refs)
        if not polygon_arc_refs:
            continue
        geometries.append(
            {
                "type": "Polygon" if len(polygon_arc_refs) == 1 else "MultiPolygon",
                "arcs": polygon_arc_refs[0] if len(polygon_arc_refs) == 1 else polygon_arc_refs,
                "properties": {"pcode": pcode, "name": name},
            }
        )

    if not geometries:
        raise RuntimeError("no supported geometry after simplification")

    return {
        "type": "Topology",
        "transform": {
            "scale": scale,
            "translate": translate,
        },
        "arcs": arcs,
        "objects": {
            level: {
                "type": "GeometryCollection",
                "geometries": geometries,
            }
        },
    }


def _load_geojson_features(data: dict[str, Any]) -> list[dict[str, Any]]:
    if data.get("type") == "FeatureCollection":
        return list(data.get("features", []))
    if data.get("type") == "Feature":
        return [data]
    raise RuntimeError("input is not a GeoJSON feature collection")


def _feature_geometry_to_geojson(shp: Path) -> list[dict[str, Any]]:
    try:
        import shapefile
    except ImportError as error:
        raise RuntimeError(
            "shapefile support is unavailable in this environment; "
            "install pyshp to parse zipped shapefiles"
        ) from error

    try:
        reader = shapefile.Reader(str(shp))
    except shapefile.ShapefileException as error:
        raise RuntimeError("shapefile zip is invalid or incomplete") from error

    features: list[dict[str, Any]] = []
    fields = [field[0] for field in reader.fields if field[0] != "DeletionFlag"]
    for shape, record in zip(reader.shapes(), reader.records(), strict=True):
        if "POLYGON" not in shape.shapeTypeName:
            continue
        ring_indices = list(shape.parts) + [len(shape.points)]
        polygons: Geometry = []
        for start, end in zip(ring_indices[:-1], ring_indices[1:], strict=True):
            ring = shape.points[start:end]
            if len(ring) < 4:
                continue
            ring_points = _coalesce([(float(x), float(y)) for x, y in ring])
            if len(ring_points) < 3:
                continue
            ring_points.append(ring_points[0])
            polygons.append(ring_points)
        if not polygons:
            continue
        properties = {fields[i]: ("" if value is None else value) for i, value in enumerate(record)}
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": polygons},
                "properties": properties,
            }
        )
    return features


def _load_feature_collection(path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as archive:
        namelist = [name for name in archive.namelist() if not name.endswith("/")]
        geojson_names = [name for name in namelist if name.lower().endswith((".geojson", ".json"))]
        if geojson_names:
            raw = json.loads(archive.read(sorted(geojson_names)[0]).decode("utf-8"))
            return _load_geojson_features(raw)
        shapefiles = [name for name in namelist if name.lower().endswith(".shp")]
        if not shapefiles:
            raise RuntimeError("zip input has no GeoJSON or shapefile files")
        with TemporaryDirectory() as root:
            archive.extractall(root)
            return _feature_geometry_to_geojson(Path(root) / sorted(shapefiles)[0])


def build_topojson(input_path: Path, level: str, tolerance: float) -> dict[str, Any]:
    if input_path.suffix.lower() == ".zip":
        features = _load_feature_collection(input_path)
    else:
        raw = json.loads(input_path.read_text())
        features = _load_geojson_features(raw)
    return _build_topology(_extract_features(features, tolerance), level)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="atlas_pipeline boundaries")
    parser.add_argument("--input", required=True)
    parser.add_argument("--level", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.0,
        help="Douglas-Peucker tolerance in degrees",
    )
    parser.add_argument("--max-bytes", type=int)
    args = parser.parse_args(argv)

    try:
        topology = build_topojson(Path(args.input), args.level, args.tolerance)
    except Exception as error:
        print(error, file=sys.stderr)
        return 1

    payload = json.dumps(topology, separators=(",", ":")) + "\n"
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload)

    if args.max_bytes is not None and len(payload.encode("utf-8")) > args.max_bytes:
        print(
            f"topojson output size {len(payload.encode('utf-8'))} "
            f"exceeds max_bytes={args.max_bytes}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
