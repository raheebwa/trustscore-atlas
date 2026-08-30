# SPDX-License-Identifier: Apache-2.0
"""Boundary conversion from small GeoJSON and zipped inputs."""

import json
import sys
import types
import zipfile
from pathlib import Path

import pytest

import atlas_pipeline.boundaries as boundaries


def _feature(geometry_type, coordinates, properties=None):
    return {
        "type": "Feature",
        "geometry": {"type": geometry_type, "coordinates": coordinates},
        "properties": {} if properties is None else properties,
    }


def _write_geojson(tmp_path: Path, data, name="boundaries.geojson") -> Path:
    path = tmp_path / name
    path.write_text(json.dumps(data))
    return path


def _collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


def test_build_topojson_polygon_has_expected_structure_and_transform(tmp_path):
    feature = _feature(
        "Polygon",
        [[[10, 20], [20, 20], [20, 30], [10, 30], [10, 20]]],
        {"PCODE": " UG001 ", "Name": " Central "},
    )
    path = _write_geojson(tmp_path, _collection(feature))

    topology = boundaries.build_topojson(path, "adm1", tolerance=0)

    assert topology == {
        "type": "Topology",
        "transform": {
            "scale": [10 / 4095, 10 / 4095],
            "translate": [10.0, 20.0],
        },
        "arcs": [
            [[0, 0], [4095, 0]],
            [[4095, 0], [0, 4095]],
            [[4095, 4095], [-4095, 0]],
            [[0, 4095], [0, -4095]],
        ],
        "objects": {
            "adm1": {
                "type": "GeometryCollection",
                "geometries": [
                    {
                        "type": "Polygon",
                        "arcs": [[0, 1, 2, 3]],
                        "properties": {"pcode": "UG001", "name": "Central"},
                    }
                ],
            }
        },
    }


def test_build_topojson_handles_multipolygons_property_fallbacks_and_level(tmp_path):
    multipolygon = _feature(
        "MultiPolygon",
        [
            [
                [[0, 0], [0, 0], [2, 0], [2, 2], [0, 2], [0, 0]],
                [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]],
            ],
            [
                [[3, 0], [4, 0], [4, 1], [3, 1], [3, 0]],
                [[3, 0], [3, 0], [3, 0]],
            ],
            [[]],
        ],
        {"pcode": " ", "ADM2_PCODE": 17, "name": None, "ADM2_NAME": " East "},
    )
    no_properties = _feature(
        "Polygon",
        [[[5, 0], [6, 0], [6, 1], [5, 1], [5, 0]]],
        [],
    )
    ignored_line = _feature("LineString", [[0, 0], [1, 1]], {"name": "ignored"})
    malformed_geometry = {"type": "Feature", "geometry": "bad", "properties": {}}
    path = _write_geojson(
        tmp_path,
        _collection(multipolygon, no_properties, ignored_line, malformed_geometry),
    )

    topology = boundaries.build_topojson(path, "districts", tolerance=0)

    assert list(topology["objects"]) == ["districts"]
    geometries = topology["objects"]["districts"]["geometries"]
    assert [geometry["type"] for geometry in geometries] == ["MultiPolygon", "Polygon"]
    assert geometries[0]["properties"] == {"pcode": "17", "name": "East"}
    assert geometries[1]["properties"] == {"pcode": None, "name": None}
    assert len(geometries[0]["arcs"]) == 2
    assert len(geometries[0]["arcs"][0]) == 2


def test_build_topojson_simplifies_dense_rings(tmp_path):
    feature = _feature(
        "Polygon",
        [
            [
                [0, 0],
                [0.5, 0],
                [1, 0],
                [1, 0.5],
                [1, 1],
                [0.5, 1],
                [0, 1],
                [0, 0.5],
                [0, 0],
            ]
        ],
    )
    path = _write_geojson(tmp_path, _collection(feature))

    topology = boundaries.build_topojson(path, "adm0", tolerance=0.1)

    assert len(topology["arcs"]) == 5
    assert topology["objects"]["adm0"]["geometries"][0]["arcs"] == [[0, 1, 2, 3, 4]]


def test_build_topojson_reuses_a_shared_arc_in_reverse(tmp_path):
    left = _feature(
        "Polygon",
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        {"admin_code": "left", "admin_name": "Left"},
    )
    right = _feature(
        "Polygon",
        [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]],
        {"adm1_pcode": "right", "adm1_name": "Right"},
    )
    path = _write_geojson(tmp_path, _collection(left, right))

    topology = boundaries.build_topojson(path, "adm1", tolerance=0)

    geometries = topology["objects"]["adm1"]["geometries"]
    assert len(topology["arcs"]) == 7
    assert geometries[0]["arcs"] == [[0, 1, 2, 3]]
    assert geometries[1]["arcs"] == [[4, 5, 6, -2]]
    assert [geometry["properties"]["name"] for geometry in geometries] == ["Left", "Right"]


def test_build_topojson_reads_the_first_sorted_geojson_from_zip(tmp_path):
    selected = _feature(
        "Polygon",
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        {"name": "Selected"},
    )
    ignored = _feature(
        "Polygon",
        [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]],
        {"name": "Ignored"},
    )
    path = tmp_path / "boundaries.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("b.geojson", json.dumps(_collection(ignored)))
        archive.writestr("a.json", json.dumps(selected))

    topology = boundaries.build_topojson(path, "adm3", tolerance=0)

    geometry = topology["objects"]["adm3"]["geometries"][0]
    assert geometry["properties"] == {"pcode": None, "name": "Selected"}


def test_build_topojson_converts_a_zipped_shapefile(tmp_path, monkeypatch):
    shapes = [
        types.SimpleNamespace(shapeTypeName="POINT", parts=[], points=[]),
        types.SimpleNamespace(
            shapeTypeName="POLYGON",
            parts=[0],
            points=[(0, 0), (1, 0), (0, 0)],
        ),
        types.SimpleNamespace(
            shapeTypeName="POLYGON",
            parts=[0],
            points=[(0, 0), (0, 0), (0, 0), (0, 0)],
        ),
        types.SimpleNamespace(
            shapeTypeName="POLYGON",
            parts=[0],
            points=[(0, 0), (2, 0), (2, 1), (0, 1), (0, 0)],
        ),
    ]
    reader = types.SimpleNamespace(
        fields=[("DeletionFlag", "C", 1, 0), ("ADM1_PCODE", "C", 10, 0), ("ADM1_NAME", "C", 10, 0)],
        shapes=lambda: shapes,
        records=lambda: [["x", "x"], ["x", "x"], ["x", "x"], [42, None]],
    )
    fake_module = types.SimpleNamespace(
        Reader=lambda _: reader,
        ShapefileException=ValueError,
    )
    monkeypatch.setitem(sys.modules, "shapefile", fake_module)
    path = tmp_path / "boundaries.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("nested/boundary.shp", b"synthetic")

    topology = boundaries.build_topojson(path, "adm1", tolerance=0)

    geometries = topology["objects"]["adm1"]["geometries"]
    assert len(geometries) == 1
    assert geometries[0]["properties"] == {"pcode": "42", "name": None}


def test_build_topojson_reports_an_invalid_zipped_shapefile(tmp_path, monkeypatch):
    class FakeShapefileException(Exception):
        pass

    def reject_reader(_):
        raise FakeShapefileException

    fake_module = types.SimpleNamespace(
        Reader=reject_reader,
        ShapefileException=FakeShapefileException,
    )
    monkeypatch.setitem(sys.modules, "shapefile", fake_module)
    path = tmp_path / "boundaries.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("boundary.shp", b"invalid")

    with pytest.raises(RuntimeError, match="shapefile zip is invalid or incomplete"):
        boundaries.build_topojson(path, "adm1", tolerance=0)


def test_build_topojson_reports_unavailable_shapefile_support(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "shapefile", None)
    path = tmp_path / "boundaries.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("boundary.shp", b"synthetic")

    with pytest.raises(RuntimeError, match="shapefile support is unavailable"):
        boundaries.build_topojson(path, "adm1", tolerance=0)


@pytest.mark.parametrize(
    ("data", "error_type", "message"),
    [
        ({"type": "Point"}, RuntimeError, "not a GeoJSON feature collection"),
        (_collection(), RuntimeError, "no supported polygon features"),
        (
            _collection(_feature("LineString", [[0, 0], [1, 1]])),
            RuntimeError,
            "no supported polygon features",
        ),
        (
            _collection(_feature("Polygon", [[[0, 0], [1, 0], [1]]])),
            TypeError,
            "invalid coordinate",
        ),
    ],
)
def test_build_topojson_rejects_invalid_geojson(tmp_path, data, error_type, message):
    path = _write_geojson(tmp_path, data)

    with pytest.raises(error_type, match=message):
        boundaries.build_topojson(path, "adm1", tolerance=0)


def test_build_topojson_rejects_zip_without_boundaries(tmp_path):
    path = tmp_path / "boundaries.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("README.txt", "no boundaries")

    with pytest.raises(RuntimeError, match="zip input has no GeoJSON or shapefile files"):
        boundaries.build_topojson(path, "adm1", tolerance=0)


def test_geometry_helpers_cover_degenerate_inputs():
    assert boundaries._simplify_ring([(0, 0), (1, 0), (0, 0)], tolerance=0.1) == [
        (0, 0),
        (1, 0),
        (0, 0),
    ]
    assert boundaries._perpendicular_distance((1, 1), (0, 0), (0, 0)) == pytest.approx(2**0.5)
    assert boundaries._encode_delta([]) == []

    with pytest.raises(RuntimeError, match="no geometry coordinates available"):
        boundaries._quantize([], steps=10)
    with pytest.raises(RuntimeError, match="no supported geometry after simplification"):
        boundaries._build_topology([(None, None, [[[(0, 0)]]])], "adm0")


def test_main_writes_minified_topology_and_creates_parent_directories(tmp_path):
    feature = _feature(
        "Polygon",
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        {"name": "Example"},
    )
    input_path = _write_geojson(tmp_path, _collection(feature))
    output_path = tmp_path / "nested" / "adm1.topojson"

    result = boundaries.main(
        [
            "--input",
            str(input_path),
            "--level",
            "adm1",
            "--output",
            str(output_path),
            "--max-bytes",
            "10000",
        ]
    )

    assert result == 0
    payload = output_path.read_text()
    assert payload.endswith("\n")
    assert " " not in payload
    assert json.loads(payload)["objects"]["adm1"]["geometries"][0]["properties"]["name"] == (
        "Example"
    )


def test_main_returns_one_when_output_exceeds_limit(tmp_path, capsys):
    feature = _feature(
        "Polygon",
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    )
    input_path = _write_geojson(tmp_path, _collection(feature))
    output_path = tmp_path / "adm1.topojson"

    result = boundaries.main(
        [
            "--input",
            str(input_path),
            "--level",
            "adm1",
            "--output",
            str(output_path),
            "--max-bytes",
            "1",
        ]
    )

    assert result == 1
    assert output_path.exists()
    assert "exceeds max_bytes=1" in capsys.readouterr().err


def test_main_returns_one_and_reports_build_errors(tmp_path, capsys):
    output_path = tmp_path / "unused.topojson"

    result = boundaries.main(
        [
            "--input",
            str(tmp_path / "missing.geojson"),
            "--level",
            "adm1",
            "--output",
            str(output_path),
        ]
    )

    assert result == 1
    assert "missing.geojson" in capsys.readouterr().err
    assert not output_path.exists()
