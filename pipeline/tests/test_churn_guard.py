# SPDX-License-Identifier: Apache-2.0
"""The identity-churn guard: a green run must never rewrite every identity unnoticed."""

import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from atlas_pipeline.__main__ import main
from atlas_pipeline.churn_guard import check_churn


def _previous_bundle(root: Path, businesses: int, aliases: int) -> Path:
    canonical = root / "bundle" / "canonical"
    canonical.mkdir(parents=True)
    pq.write_table(
        pa.table({"atlas_id": [f"atl_{i:016x}" for i in range(businesses)]}),
        canonical / "businesses.parquet",
    )
    pq.write_table(
        pa.table({"atlas_id": [f"atl_{i:016x}" for i in range(aliases)]}),
        canonical / "aliases.parquet",
    )
    return root / "bundle"


def _regeneration(root: Path, *, new_entities: int, labels: int, aliases: int) -> Path:
    regen = root / "regen" / "20260830T050000Z"
    regen.mkdir(parents=True)
    (regen / "regeneration.json").write_text(
        json.dumps(
            {
                "id": "20260830T050000Z",
                "new_entities": new_entities,
                "labels": labels,
                "counts": {"businesses": 1000, "aliases": aliases},
            }
        )
    )
    return regen


def _labels(root: Path, count: int) -> Path:
    path = root / "canonical" / "labels.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join('{"verdict":"match"}\n' for _ in range(count)))
    return path


def test_a_healthy_regeneration_passes_and_reports_its_numbers(tmp_path: Path):
    previous = _previous_bundle(tmp_path, businesses=1000, aliases=40)
    regen = _regeneration(tmp_path, new_entities=12, labels=53, aliases=42)
    report = check_churn(
        regeneration_dir=regen, previous_bundle=previous, labels_file=_labels(tmp_path, 53)
    )
    assert report.ok
    assert (
        report.previous_businesses,
        report.new_entities,
        report.labels_applied,
        report.aliases,
    ) == (1000, 12, 53, 42)
    assert report.new_entity_share == 0.012


def test_each_churn_condition_trips_the_guard(tmp_path: Path):
    previous = _previous_bundle(tmp_path, businesses=1000, aliases=40)
    labels = _labels(tmp_path, 53)

    fresh_crosswalk = _regeneration(tmp_path / "a", new_entities=1000, labels=53, aliases=42)
    report = check_churn(
        regeneration_dir=fresh_crosswalk, previous_bundle=previous, labels_file=labels
    )
    assert not report.ok and "new entities 1000" in report.reasons[0]

    no_labels = _regeneration(tmp_path / "b", new_entities=5, labels=0, aliases=42)
    report = check_churn(regeneration_dir=no_labels, previous_bundle=previous, labels_file=labels)
    assert not report.ok and "labels applied 0" in report.reasons[0]

    lost_merges = _regeneration(tmp_path / "c", new_entities=5, labels=53, aliases=0)
    report = check_churn(regeneration_dir=lost_merges, previous_bundle=previous, labels_file=labels)
    assert not report.ok and "aliases 0" in report.reasons[0]


def test_first_ever_regeneration_has_nothing_to_compare(tmp_path: Path):
    previous = tmp_path / "missing-bundle"
    regen = _regeneration(tmp_path, new_entities=79000, labels=0, aliases=0)
    report = check_churn(
        regeneration_dir=regen, previous_bundle=previous, labels_file=tmp_path / "none.jsonl"
    )
    assert report.ok and report.previous_businesses == 0


def test_cli_exits_non_zero_and_writes_the_report_when_the_guard_trips(tmp_path: Path, capsys):
    previous = _previous_bundle(tmp_path, businesses=1000, aliases=40)
    _regeneration(tmp_path, new_entities=1000, labels=0, aliases=0)
    _labels(tmp_path, 53)
    out = tmp_path / "guard.json"
    code = main(
        [
            "guard",
            "--regeneration",
            "20260830T050000Z",
            "--data-root",
            str(tmp_path),
            "--previous-bundle",
            str(previous),
            "--out",
            str(out),
        ]
    )
    assert code == 1
    written = json.loads(out.read_text())
    assert written["ok"] is False and len(written["reasons"]) == 3
    assert "reasons" in capsys.readouterr().out
