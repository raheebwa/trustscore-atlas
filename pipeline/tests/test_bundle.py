# SPDX-License-Identifier: Apache-2.0
"""Download bundles contain canonical tables, accepted source runs, and metadata."""

import hashlib
import json
from pathlib import Path

import pyarrow.csv as pacsv
import pyarrow.parquet as pq
import pytest

from atlas_pipeline.__main__ import main
from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.bundle import publish_bundle
from atlas_pipeline.regenerate import regenerate

from .conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "kcca_businesses"
REGENERATION_ID = "20260829T210000Z"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())
LABEL = {
    "atlas_id": "atl_labelled_business",
    "candidate_atlas_id": "atl_candidate_business",
    "verdict": "non_match",
    "labelled_at": "2026-08-29T21:30:00Z",
    "labelled_by": "maintainer",
    "note": "Fixture review",
    "decision": "LABEL-FIXTURE-1",
}


def _slug(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-")


@pytest.fixture
def regenerated(tmp_path: Path) -> Path:
    spec = load_adapter(ADAPTER)
    pages = {
        spec.module.query_url(n): (ADAPTER / "fixtures" / "raw" / f"{_slug(n)}.html").read_bytes()
        for n in EXPECTED["natures"]
    }
    run_adapter(
        spec,
        data_root=tmp_path,
        run_id=RUN_ID,
        started_at=STARTED_AT,
        fetcher=lambda url, **_request: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id=REGENERATION_ID,
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    labels = tmp_path / "canonical" / "labels.jsonl"
    labels.write_text(json.dumps(LABEL) + "\n")
    return tmp_path


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def test_publish_bundle_writes_data_and_self_describing_metadata(regenerated: Path):
    out = regenerated / "bundles" / REGENERATION_ID

    result = publish_bundle(
        regeneration_id=REGENERATION_ID,
        data_root=regenerated,
        out=out,
        packs_root=PACKS,
    )

    expected = {
        "LICENSE",
        "SOURCES.md",
        "datapackage.json",
        "manifest.json",
        "canonical/aliases.csv",
        "canonical/aliases.parquet",
        "canonical/businesses.csv",
        "canonical/businesses.parquet",
        "canonical/crosswalk.parquet",
        "canonical/labels.csv",
        "canonical/labels.jsonl",
        "canonical/labels.parquet",
        "canonical/linkage_candidates.csv",
        "canonical/linkage_candidates.parquet",
        "canonical/scores.csv",
        "canonical/scores.parquet",
        "canonical/segments.csv",
        "canonical/segments.parquet",
        "canonical/statements.parquet",
        "sources/kcca.businesses/manifest.json",
        "sources/kcca.businesses/records.parquet",
        "sources/kcca.businesses/statements.parquet",
    }
    assert {
        path.relative_to(out).as_posix() for path in out.rglob("*") if path.is_file()
    } == expected
    assert result.directory == out

    datapackage = json.loads((out / "datapackage.json").read_text())
    assert datapackage["name"] == f"trustscore-atlas-{REGENERATION_ID}"
    assert datapackage["version"] == REGENERATION_ID
    assert "statements CSV is intentionally omitted" in datapackage["description"]
    assert datapackage["sources"] == [
        {"title": "Licensed businesses", "path": "https://kcca.go.ug/businesses"}
    ]
    resources_by_path = {resource["path"]: resource for resource in datapackage["resources"]}
    assert "canonical/crosswalk.parquet" in resources_by_path
    assert "canonical/labels.jsonl" in resources_by_path
    for resource in datapackage["resources"]:
        resource_path = out / resource["path"]
        assert resource_path.exists()
        assert resource["bytes"] == resource_path.stat().st_size
        assert resource["hash"] == f"sha256:{_sha256(resource_path)}"
        if resource_path.suffix == ".jsonl":
            assert [field["name"] for field in resource["schema"]["fields"]] == list(LABEL.keys())
        else:
            parquet_path = (
                resource_path.with_suffix(".parquet")
                if resource_path.suffix == ".csv"
                else resource_path
            )
            assert [field["name"] for field in resource["schema"]["fields"]] == list(
                pq.read_schema(parquet_path).names
            )

    businesses_csv = pacsv.read_csv(out / "canonical" / "businesses.csv")
    businesses_parquet = pq.read_table(out / "canonical" / "businesses.parquet")
    assert businesses_csv.num_rows == businesses_parquet.num_rows
    assert "Kampala Capital City Authority" in (out / "SOURCES.md").read_text()
    assert "public-record" in (out / "SOURCES.md").read_text()
    assert (out / "canonical" / "crosswalk.parquet").read_bytes() == (
        regenerated / "canonical" / "crosswalk.parquet"
    ).read_bytes()
    assert (out / "canonical" / "labels.jsonl").read_bytes() == (
        regenerated / "canonical" / "labels.jsonl"
    ).read_bytes()

    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["regeneration_id"] == REGENERATION_ID
    assert manifest["packs"] == ["UG"]
    assert {file["path"] for file in manifest["files"]} == expected - {"manifest.json"}
    assert manifest["total_bytes"] == sum(file["bytes"] for file in manifest["files"])
    assert manifest["file_count"] == len(manifest["files"])
    for file in manifest["files"]:
        path = out / file["path"]
        assert file["bytes"] == path.stat().st_size
        assert file["sha256"] == _sha256(path)


def test_bundle_cli_invokes_publisher(regenerated: Path):
    out = regenerated / "cli-bundle"

    assert (
        main(
            [
                "bundle",
                "--regeneration",
                REGENERATION_ID,
                "--data-root",
                str(regenerated),
                "--out",
                str(out),
            ]
        )
        == 0
    )

    assert (out / "datapackage.json").exists()
    assert json.loads((out / "manifest.json").read_text())["regeneration_id"] == REGENERATION_ID
