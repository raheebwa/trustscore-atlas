"""Snapshot runs: when a register stops serving, a dated typed table received earlier is loaded
through the same adapter contract with honest time semantics."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from atlas_pipeline.adapters import load_adapter, run_adapter

from .conftest import PACKS, RUN_ID, SALT

ADAPTER = PACKS / "ug" / "sources" / "ura_vat_withholding_agents"
SNAPSHOT_AT = datetime(2026, 5, 12, tzinfo=UTC)


def _snapshot(tmp_path: Path) -> Path:
    table = pa.Table.from_pylist(
        [
            {
                "sr_no": "1",
                "tin": "1000000001",
                "name": "EXAMPLE HARDWARE SUPPLIES LTD",
                "designation_effective_date": "01/07/2024",
            },
            {
                "sr_no": "2",
                "tin": "1000000002",
                "name": "SAMPLE BAKERY",
                "designation_effective_date": "15/03/2025",
            },
        ]
    )
    path = tmp_path / "vat-withholding-agents.parquet"
    pq.write_table(table, path)
    return path


def test_snapshot_run_loads_typed_rows_with_the_original_pull_time(tmp_path):
    spec = load_adapter(ADAPTER)
    snapshot = _snapshot(tmp_path)

    def refuse(url, **_):
        raise AssertionError(f"network fetch attempted during a snapshot run: {url}")

    result = run_adapter(
        spec,
        data_root=tmp_path / "data",
        run_id=RUN_ID,
        fetcher=refuse,
        salt=SALT,
        snapshot=snapshot,
        snapshot_at=SNAPSHOT_AT,
        snapshot_ref="URA report 1004, pulled 2026-05-12",
    )
    manifest = result.manifest
    assert manifest["rows"] == 2 and manifest["flags"] == []
    assert manifest["snapshot"] == {"file": snapshot.name, "observed_at": "2026-05-12T00:00:00Z"}
    assert manifest["started_at"] == "2026-05-12T00:00:00Z"
    assert [o["name"] for o in manifest["raw_objects"]] == [snapshot.name]
    assert (result.raw_dir / snapshot.name).read_bytes() == snapshot.read_bytes()
    statements = pq.read_table(result.output_dir / "statements.parquet").to_pylist()
    assert {s["asserted_at"] for s in statements} == {SNAPSHOT_AT}
    assert {s["source_ref"] for s in statements} == {"URA report 1004, pulled 2026-05-12"}
    records = pq.read_table(result.output_dir / "records.parquet").to_pylist()
    assert {r["designation_effective_date"] for r in records} == {"2024-07-01", "2025-03-15"}
    accepted = json.loads((result.output_dir.parents[1] / "accepted.json").read_text())
    assert accepted["run_id"] == RUN_ID
