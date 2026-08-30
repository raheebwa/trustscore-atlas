"""Retained SQL description and verification: a stale file set is refused before any load."""

import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from atlas_pipeline.__main__ import main
from atlas_pipeline.churn_guard import compare_bundles
from atlas_pipeline.retained_sql import SQL_FILES, describe_sql_dir, verify_sql_dir


def _sql_set(root: Path, upsert: bool = True) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    verb = "INSERT OR REPLACE INTO" if upsert else "INSERT INTO"
    for name in SQL_FILES:
        if name.endswith("stage.sql"):
            body = f"CREATE TABLE t__x (id TEXT);\n{verb} regenerations (id) VALUES ('x');\n"
        elif name.endswith("swap.sql"):
            body = (
                "ALTER TABLE t__x RENAME TO t;\n"
                "INSERT OR REPLACE INTO meta (key, value) VALUES ('live_regeneration', 'x');\n"
            )
        else:
            body = "DROP TABLE IF EXISTS old;\n"
        (root / name).write_text(body)
    return root


def test_describe_records_checksums_counts_and_the_upsert_flag(tmp_path: Path):
    described = describe_sql_dir(_sql_set(tmp_path / "sql"))
    assert set(described) == set(SQL_FILES)
    assert described["stage.sql"]["statements"] == 2
    assert described["stage.sql"]["upsert"] is True
    assert "upsert" not in described["swap.sql"]
    assert len(described["prelude.sql"]["sha256"]) == 64


def test_verify_accepts_a_matching_set_and_names_every_mismatch(tmp_path: Path):
    good = _sql_set(tmp_path / "good")
    expected = describe_sql_dir(good)
    assert verify_sql_dir(good, expected) == []

    stale = _sql_set(tmp_path / "stale", upsert=False)
    reasons = verify_sql_dir(stale, expected)
    assert any("stage.sql checksum" in r for r in reasons)
    assert any("without the upsert" in r for r in reasons)

    (good / "swap.sql").write_text("ALTER TABLE t__x RENAME TO t;\n")
    reasons = verify_sql_dir(good, expected)
    assert any("swap.sql has 1 statements, the index says 2" in r for r in reasons)

    (good / "prelude.sql").unlink()
    assert any("prelude.sql is missing" in r for r in verify_sql_dir(good, expected))


def test_cli_describe_and_verify_against_an_index(tmp_path: Path, capsys):
    sql = _sql_set(tmp_path / "sql")
    assert main(["regen", "describe", "--dir", str(sql)]) == 0
    described = json.loads(capsys.readouterr().out)
    index = tmp_path / "index.json"
    index.write_text(
        json.dumps(
            {"regenerations": ["20260830T000000Z"], "files": {"20260830T000000Z": described}}
        )
    )
    assert (
        main(
            [
                "regen",
                "verify",
                "--dir",
                str(sql),
                "--index",
                str(index),
                "--regeneration",
                "20260830T000000Z",
            ]
        )
        == 0
    )
    (sql / "stage.sql").write_text("INSERT INTO regenerations (id) VALUES ('x');\n")
    assert (
        main(
            [
                "regen",
                "verify",
                "--dir",
                str(sql),
                "--index",
                str(index),
                "--regeneration",
                "20260830T000000Z",
            ]
        )
        == 1
    )
    assert "upsert" in capsys.readouterr().err
    assert (
        main(
            [
                "regen",
                "verify",
                "--dir",
                str(sql),
                "--index",
                str(index),
                "--regeneration",
                "20260830T999999Z",
            ]
        )
        == 1
    )


def _bundle(root: Path, businesses: int, aliases: int, labels: int) -> Path:
    canonical = root / "canonical"
    canonical.mkdir(parents=True)
    pq.write_table(
        pa.table({"atlas_id": [str(i) for i in range(businesses)]}),
        canonical / "businesses.parquet",
    )
    pq.write_table(
        pa.table({"atlas_id": [str(i) for i in range(aliases)]}), canonical / "aliases.parquet"
    )
    (canonical / "labels.jsonl").write_text("".join('{"verdict":"match"}\n' for _ in range(labels)))
    return root


def test_bundle_comparison_guards_a_rollback_target_against_the_live_bundle(tmp_path: Path):
    live = _bundle(tmp_path / "live", businesses=1000, aliases=70, labels=53)
    ok = compare_bundles(
        target=_bundle(tmp_path / "ok", businesses=995, aliases=68, labels=53), live=live
    )
    assert ok.ok and ok.previous_businesses == 1000 and ok.aliases == 68

    churned = compare_bundles(
        target=_bundle(tmp_path / "churn", businesses=1100, aliases=0, labels=0), live=live
    )
    assert not churned.ok
    assert any("businesses" in r for r in churned.reasons)
    assert any("labels" in r for r in churned.reasons)
    assert any("aliases 0" in r for r in churned.reasons)
