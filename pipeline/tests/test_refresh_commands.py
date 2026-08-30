"""Scheduled refresh commands discover adapters and restore durable pipeline state."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import atlas_pipeline.__main__ as cli
from atlas_pipeline.__main__ import main
from atlas_pipeline.refresh import due_adapter_directories, restore_bundle


def _write_source(root: Path, country: str, directory: str, cadence: str) -> Path:
    adapter = root / country / "sources" / directory
    adapter.mkdir(parents=True)
    (adapter / "source.yml").write_text(f"cadence: {cadence}\n")
    return adapter


@pytest.mark.parametrize(
    ("cadence", "expected_names"),
    [
        ("weekly", ["weekly_source"]),
        ("monthly", ["monthly_source"]),
        ("quarterly", ["quarterly_source"]),
        ("annual", ["annual_source"]),
        (
            "all",
            [
                "irregular_source",
                "monthly_source",
                "quarterly_source",
                "weekly_source",
                "annual_source",
            ],
        ),
    ],
)
def test_due_prints_matching_adapter_directories(
    tmp_path: Path, capsys, cadence: str, expected_names: list[str]
):
    packs = tmp_path / "packs"
    adapters = [
        _write_source(packs, "ke", "irregular_source", "irregular"),
        _write_source(packs, "ke", "monthly_source", "monthly"),
        _write_source(packs, "ke", "quarterly_source", "quarterly"),
        _write_source(packs, "ug", "weekly_source", "weekly"),
        _write_source(packs, "ug", "annual_source", "annual"),
    ]
    (packs / "ug" / "sources" / "without_source_yml").mkdir()

    assert main(["due", "--cadence", cadence, "--packs-dir", str(packs)]) == 0

    expected = sorted(str(adapter) for adapter in adapters if adapter.name in expected_names)
    assert capsys.readouterr().out.splitlines() == expected


def test_due_succeeds_with_no_matching_sources(tmp_path: Path, capsys):
    packs = tmp_path / "packs"
    _write_source(packs, "ug", "annual_source", "annual")

    assert main(["due", "--cadence", "weekly", "--packs-dir", str(packs)]) == 0
    assert capsys.readouterr().out == ""


def test_due_helper_rejects_an_unknown_cadence(tmp_path: Path):
    with pytest.raises(ValueError, match="unsupported cadence"):
        due_adapter_directories(tmp_path, "irregular")


def _write_bundled_source(
    bundle: Path, slug: str, country: str, run_id: str, rows: int
) -> dict[str, bytes]:
    source = bundle / "sources" / slug
    source.mkdir(parents=True)
    files = {
        "records.parquet": f"records:{slug}".encode(),
        "statements.parquet": f"statements:{slug}".encode(),
    }
    for name, content in files.items():
        (source / name).write_bytes(content)
    manifest = {
        "run_id": run_id,
        "source": slug,
        "country": country,
        "finished_at": "2026-08-30T03:00:00Z",
        "rows": rows,
        "flags": [],
    }
    (source / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return files


def test_restore_rebuilds_accepted_runs_and_canonical_state_idempotently(tmp_path: Path, capsys):
    bundle = tmp_path / "bundle"
    data_root = tmp_path / "data"
    ug_files = _write_bundled_source(bundle, "ppda.ocds", "UG", "20260830T020000Z", rows=12)
    ke_files = _write_bundled_source(
        bundle, "cbk.licensed_banks", "KE", "20260830T023000Z", rows=34
    )
    canonical = bundle / "canonical"
    canonical.mkdir()
    (canonical / "crosswalk.parquet").write_bytes(b"crosswalk-state")
    (canonical / "labels.jsonl").write_text('{"verdict":"non_match"}\n')

    command = ["restore", "--bundle", str(bundle), "--data-root", str(data_root)]
    assert main(command) == 0
    assert main(command) == 0
    capsys.readouterr()

    restored = [
        ("ug", "ppda_ocds", "20260830T020000Z", ug_files),
        ("ke", "cbk_licensed_banks", "20260830T023000Z", ke_files),
    ]
    for country, source_dir, run_id, expected_files in restored:
        root = data_root / "sources" / country / source_dir
        run = root / "runs" / run_id
        assert json.loads((root / "accepted.json").read_text())["run_id"] == run_id
        for name, content in expected_files.items():
            assert (run / name).read_bytes() == content
        assert json.loads((run / "manifest.json").read_text())["run_id"] == run_id

    assert (data_root / "canonical" / "crosswalk.parquet").read_bytes() == b"crosswalk-state"
    assert (data_root / "canonical" / "labels.jsonl").read_text() == ('{"verdict":"non_match"}\n')


def test_restore_rejects_an_unsafe_manifest_source(tmp_path: Path):
    bundle = tmp_path / "bundle"
    _write_bundled_source(bundle, "safe.source", "UG", "20260830T020000Z", rows=1)
    manifest_path = bundle / "sources" / "safe.source" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) | {"source": "../outside"}
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(ValueError, match="invalid source"):
        restore_bundle(bundle=bundle, data_root=tmp_path / "data")


def test_restore_rejects_a_manifest_slug_mismatch(tmp_path: Path):
    bundle = tmp_path / "bundle"
    _write_bundled_source(bundle, "safe.source", "UG", "20260830T020000Z", rows=1)
    manifest_path = bundle / "sources" / "safe.source" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) | {"source": "other.source"}
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(ValueError, match="does not match bundle directory"):
        restore_bundle(bundle=bundle, data_root=tmp_path / "data")


def test_restore_rejects_an_incomplete_bundled_run(tmp_path: Path):
    bundle = tmp_path / "bundle"
    _write_bundled_source(bundle, "safe.source", "UG", "20260830T020000Z", rows=1)
    (bundle / "sources" / "safe.source" / "statements.parquet").unlink()

    with pytest.raises(FileNotFoundError, match="statements.parquet"):
        restore_bundle(bundle=bundle, data_root=tmp_path / "data")


def test_restore_rejects_a_flagged_bundled_run(tmp_path: Path):
    bundle = tmp_path / "bundle"
    _write_bundled_source(bundle, "safe.source", "UG", "20260830T020000Z", rows=1)
    manifest_path = bundle / "sources" / "safe.source" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) | {"flags": ["row_count_out_of_tolerance"]}
    manifest_path.write_text(json.dumps(manifest))

    with pytest.raises(ValueError, match="bundled run is not acceptable"):
        restore_bundle(bundle=bundle, data_root=tmp_path / "data")


def test_run_cli_returns_nonzero_and_does_not_accept_conformance_rejection(
    tmp_path: Path, monkeypatch, capsys
):
    adapter_dir = tmp_path / "adapter"
    output_dir = tmp_path / "data" / "sources" / "ug" / "example" / "runs" / "run-1"
    output_dir.mkdir(parents=True)
    result = SimpleNamespace(
        output_dir=output_dir,
        manifest={"run_id": "run-1", "source": "example.source", "rows": 1},
    )
    accepted_calls = []
    monkeypatch.setattr(cli, "load_adapter", lambda _path: object())
    monkeypatch.setattr(cli, "run_adapter", lambda *_args, **_kwargs: result)
    monkeypatch.setattr(cli, "check_run", lambda *_args: ["identifier fails pattern"])
    monkeypatch.setattr(
        cli,
        "accept_run",
        lambda source_dir, run_id, *, findings: (
            accepted_calls.append((source_dir, run_id, findings)) or False
        ),
    )

    assert main(["run", str(adapter_dir), "--data-root", str(tmp_path / "data")]) == 1
    assert accepted_calls == [(output_dir.parents[1], "run-1", ["identifier fails pattern"])]
    assert json.loads(capsys.readouterr().out)["accepted"] is False
