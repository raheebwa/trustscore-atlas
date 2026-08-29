"""Regeneration: every loaded source -> canonical parquet, scores, and serving SQL."""

import json
from pathlib import Path

import pyarrow.parquet as pq

from atlas_pipeline.adapters import load_adapter, run_adapter
from atlas_pipeline.regenerate import regenerate

from .conftest import PACKS, RUN_ID, SALT, STARTED_AT

ADAPTER = PACKS / "ug" / "sources" / "kcca_businesses"
EXPECTED = json.loads((ADAPTER / "fixtures" / "expected.json").read_text())


def _slug(nature: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in nature.lower()).strip("-")


def test_regenerate_from_one_source(tmp_path: Path):
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
        fetcher=lambda url: pages[url],
        salt=SALT,
        params={"natures": EXPECTED["natures"]},
    )
    out = regenerate(
        pack_dir=PACKS / "ug",
        data_root=tmp_path,
        regeneration_id="20260829T210000Z",
        computed_at="2026-08-29T21:00:00Z",
        rubrics_dir=PACKS.parent / "rubrics",
        schema_path=PACKS.parent / "infra" / "d1" / "schema.sql",
    )
    assert out.directory == tmp_path / "regen" / "20260829T210000Z"
    businesses = pq.read_table(out.directory / "businesses.parquet").to_pylist()
    assert len(businesses) == EXPECTED["entities"]
    scores = pq.read_table(out.directory / "scores.parquet").to_pylist()
    assert {s["rubric"] for s in scores} == {"formality"}
    assert all(json.loads(s["evidence"]) for s in scores)
    assert all(s["value"] == 25 for s in scores)  # KCCA only: local trading licence
    statements = pq.read_table(out.directory / "statements_resolved.parquet")
    assert "atlas_id" in statements.column_names and statements.num_rows == EXPECTED["rows"] * 6
    stage = (out.directory / "stage.sql").read_text()
    swap = (out.directory / "swap.sql").read_text()
    assert "businesses__20260829T210000Z" in stage and "RENAME TO businesses;" in swap
    summary = json.loads((out.directory / "regeneration.json").read_text())
    assert summary["inputs"] == {"kcca.businesses": RUN_ID}
    assert summary["counts"]["businesses"] == EXPECTED["entities"]
    assert summary["sources"][0]["status"] == "fresh"
