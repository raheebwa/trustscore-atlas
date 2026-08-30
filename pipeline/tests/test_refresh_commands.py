"""Scheduled refresh commands discover adapters and restore durable pipeline state."""

import json
import re
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

import atlas_pipeline.__main__ as cli
from atlas_pipeline.__main__ import main
from atlas_pipeline.maintainer_labels import compile_maintainer_labels
from atlas_pipeline.refresh import due_adapter_directories, restore_bundle
from atlas_pipeline.regeneration_requests import mark_request, next_pending_request
from atlas_pipeline.remote_d1 import RemoteD1, sql_text


def _d1_result(rows: list[dict], *, success: bool = True) -> str:
    return json.dumps([{"results": rows, "success": success}])


class FakeD1Runner:
    def __init__(self, labels: list[dict] | None = None, results: list[list[dict]] | None = None):
        self.labels = labels or []
        self.results = list(results or [])
        self.compiled: set[str] = set()
        self.commands: list[list[str]] = []
        self.sql: list[str] = []

    def __call__(self, command: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
        assert kwargs["capture_output"] is True
        assert kwargs["text"] is True
        assert kwargs["check"] is True
        assert "env" not in kwargs
        assert command[:-1] == [
            "pnpm",
            "exec",
            "wrangler",
            "d1",
            "execute",
            "atlas",
            "--remote",
            "--json",
            "--command",
        ]
        self.commands.append(command)
        statement = command[-1]
        self.sql.append(statement)
        if statement.startswith("SELECT m.label_id"):
            rows = [row for row in self.labels if row["label_id"] not in self.compiled]
        elif statement.startswith("INSERT INTO maintainer_label_compilations"):
            label_id = next(
                row["label_id"] for row in self.labels if f"'{row['label_id']}'" in statement
            )
            self.compiled.add(label_id)
            rows = []
        else:
            rows = self.results.pop(0) if self.results else []
        return subprocess.CompletedProcess(command, 0, stdout=_d1_result(rows), stderr="")


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


def _maintainer_label(label_id: str, labelled_at: str, reason: str = "Reviewed") -> dict:
    return {
        "label_id": label_id,
        "atlas_id": f"atl_{label_id}_left",
        "candidate_atlas_id": f"atl_{label_id}_right",
        "verdict": "match" if label_id.endswith("1") else "non_match",
        "reason": reason,
        "labelled_by": "ops@example.test",
        "labelled_at": labelled_at,
    }


def test_compile_maintainer_labels_appends_rows_and_records_compilations(tmp_path: Path):
    labels_path = tmp_path / "data" / "canonical" / "labels.jsonl"
    labels_path.parent.mkdir(parents=True)
    labels_path.write_text('{"row": 1}')
    runner = FakeD1Runner(
        labels=[
            _maintainer_label("mlabel_1", "2026-08-30T04:00:00Z", "Same legal entity"),
            _maintainer_label("mlabel_2", "2026-08-30T04:01:00Z", "Different operator"),
        ]
    )

    compiled = compile_maintainer_labels(
        data_root=tmp_path / "data",
        regeneration_id="20260830T041500Z",
        runner=runner,
        app_dir=tmp_path / "app",
        compiled_at="2026-08-30T04:15:01Z",
    )

    lines = [json.loads(line) for line in labels_path.read_text().splitlines()]
    assert lines[1:] == compiled
    assert compiled == [
        {
            "atlas_id": "atl_mlabel_1_left",
            "candidate_atlas_id": "atl_mlabel_1_right",
            "verdict": "match",
            "labelled_at": "2026-08-30T04:00:00Z",
            "labelled_by": "ops@example.test",
            "note": "Same legal entity",
            "decision": "OPS-mlabel_1",
            "row": 2,
        },
        {
            "atlas_id": "atl_mlabel_2_left",
            "candidate_atlas_id": "atl_mlabel_2_right",
            "verdict": "non_match",
            "labelled_at": "2026-08-30T04:01:00Z",
            "labelled_by": "ops@example.test",
            "note": "Different operator",
            "decision": "OPS-mlabel_2",
            "row": 3,
        },
    ]
    inserts = [sql for sql in runner.sql if "INSERT INTO maintainer_label_compilations" in sql]
    assert len(inserts) == 2
    assert all("'20260830T041500Z'" in sql for sql in inserts)
    assert all("'2026-08-30T04:15:01Z'" in sql for sql in inserts)


def test_compile_maintainer_labels_is_idempotent(tmp_path: Path):
    runner = FakeD1Runner(labels=[_maintainer_label("mlabel_1", "2026-08-30T04:00:00Z")])
    arguments = {
        "data_root": tmp_path / "data",
        "regeneration_id": "20260830T041500Z",
        "runner": runner,
        "app_dir": tmp_path / "app",
    }

    assert len(compile_maintainer_labels(**arguments)) == 1
    labels_path = tmp_path / "data" / "canonical" / "labels.jsonl"
    first = labels_path.read_bytes()
    assert compile_maintainer_labels(**arguments) == []
    assert labels_path.read_bytes() == first
    assert len([sql for sql in runner.sql if sql.startswith("INSERT")]) == 1


def test_compile_maintainer_labels_empty_result_does_not_create_file(tmp_path: Path):
    runner = FakeD1Runner()

    assert (
        compile_maintainer_labels(
            data_root=tmp_path / "data",
            regeneration_id="20260830T041500Z",
            runner=runner,
            app_dir=tmp_path / "app",
        )
        == []
    )
    assert not (tmp_path / "data" / "canonical" / "labels.jsonl").exists()


def test_next_pending_request_returns_oldest_result_and_can_filter_kind(tmp_path: Path):
    request = {
        "request_id": "rreq_1",
        "kind": "regenerate",
        "target_id": None,
        "reason": "Refresh now",
        "requested_by": "ops@example.test",
        "requested_at": "2026-08-30T04:00:00Z",
    }
    runner = FakeD1Runner(results=[[request], []])

    assert (
        next_pending_request(
            data_root=tmp_path / "data",
            kind="regenerate",
            runner=runner,
            app_dir=tmp_path / "app",
        )
        == request
    )
    assert "ORDER BY latest.occurred_at DESC, latest.rowid DESC" in runner.sql[0]
    assert "AND r.kind = 'regenerate'" in runner.sql[0]
    assert (
        next_pending_request(data_root=tmp_path / "data", runner=runner, app_dir=tmp_path / "app")
        is None
    )
    assert "AND r.kind" not in runner.sql[1]


def test_request_helpers_validate_inputs_and_append_events(tmp_path: Path):
    runner = FakeD1Runner()

    event = mark_request(
        request_id="rreq_operator's",
        status="failed",
        note="load didn't finish",
        runner=runner,
        app_dir=tmp_path / "app",
        event_id="rrev_fixed",
        occurred_at="2026-08-30T04:30:00Z",
    )

    assert event == {
        "event_id": "rrev_fixed",
        "request_id": "rreq_operator's",
        "status": "failed",
        "note": "load didn't finish",
        "occurred_at": "2026-08-30T04:30:00Z",
    }
    assert "'rreq_operator''s'" in runner.sql[0]
    assert "'load didn''t finish'" in runner.sql[0]
    automatic = mark_request(
        request_id="rreq_automatic", status="running", runner=runner, app_dir=tmp_path / "app"
    )
    assert re.fullmatch(r"rrev_[0-9a-f]{32}", automatic["event_id"])
    assert re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", automatic["occurred_at"]
    )
    assert "NULL" in runner.sql[1]
    with pytest.raises(ValueError, match="unsupported request status"):
        mark_request(request_id="rreq_1", status="unknown", runner=runner)
    with pytest.raises(ValueError, match="unsupported request kind"):
        next_pending_request(data_root=tmp_path, kind="unknown", runner=runner)


def test_remote_d1_parses_json_shapes_and_rejects_invalid_results(tmp_path: Path):
    command_result = subprocess.CompletedProcess(
        [], 0, stdout=json.dumps({"success": True, "results": [{"value": 1}]}), stderr=""
    )
    client = RemoteD1(runner=lambda *_args, **_kwargs: command_result, app_dir=tmp_path)
    assert client.execute("SELECT 1") == [{"value": 1}]

    unsuccessful = subprocess.CompletedProcess([], 0, stdout=_d1_result([], success=False))
    with pytest.raises(RuntimeError, match="unsuccessful"):
        RemoteD1(runner=lambda *_args, **_kwargs: unsuccessful).execute("SELECT 1")
    invalid = subprocess.CompletedProcess(
        [], 0, stdout=json.dumps([{"success": True, "results": "not rows"}])
    )
    with pytest.raises(RuntimeError, match="invalid"):
        RemoteD1(runner=lambda *_args, **_kwargs: invalid).execute("SELECT 1")
    assert sql_text(None) == "NULL"
    assert sql_text("operator's") == "'operator''s'"


def test_maintainer_command_line_routes_commands(monkeypatch, tmp_path: Path, capsys):
    compile_calls = []
    request_calls = []
    mark_calls = []
    monkeypatch.setattr(
        cli,
        "compile_maintainer_labels",
        lambda **kwargs: compile_calls.append(kwargs) or [{"row": 1}],
    )
    monkeypatch.setattr(
        cli,
        "next_pending_request",
        lambda **kwargs: request_calls.append(kwargs) or {"request_id": "rreq_1"},
    )
    monkeypatch.setattr(
        cli,
        "mark_request",
        lambda **kwargs: mark_calls.append(kwargs) or {"event_id": "rrev_1"},
    )

    assert (
        main(
            [
                "labels",
                "compile",
                "--data-root",
                str(tmp_path),
                "--regeneration",
                "20260830T041500Z",
            ]
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out) == {"compiled": 1}
    assert compile_calls == [{"data_root": tmp_path, "regeneration_id": "20260830T041500Z"}]

    assert main(["requests", "next", "--data-root", str(tmp_path), "--kind", "rollback"]) == 0
    assert json.loads(capsys.readouterr().out) == {"request_id": "rreq_1"}
    assert request_calls == [{"data_root": tmp_path, "kind": "rollback"}]

    assert (
        main(
            [
                "requests",
                "mark",
                "--request-id",
                "rreq_1",
                "--status",
                "done",
                "--note",
                "loaded",
            ]
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out) == {"event_id": "rrev_1"}
    assert mark_calls == [{"request_id": "rreq_1", "status": "done", "note": "loaded"}]


def test_requests_next_cli_prints_nothing_when_queue_is_empty(monkeypatch, capsys):
    monkeypatch.setattr(cli, "next_pending_request", lambda **_kwargs: None)

    assert main(["requests", "next"]) == 0
    assert capsys.readouterr().out == ""


def test_boundaries_command_line_forwards_optional_size(monkeypatch, tmp_path: Path):
    calls = []
    monkeypatch.setattr(cli.boundaries, "main", lambda args: calls.append(args) or 0)

    assert (
        main(
            [
                "boundaries",
                "--input",
                str(tmp_path / "input.geojson"),
                "--level",
                "adm2",
                "--output",
                str(tmp_path / "output.topojson"),
                "--tolerance",
                "0.01",
                "--max-bytes",
                "5000",
            ]
        )
        == 0
    )
    assert calls == [
        [
            "--input",
            str(tmp_path / "input.geojson"),
            "--level",
            "adm2",
            "--output",
            str(tmp_path / "output.topojson"),
            "--tolerance",
            "0.01",
            "--max-bytes",
            "5000",
        ]
    ]


def test_restore_refuses_a_bundle_without_the_canonical_state_unless_allowed(tmp_path: Path):
    """A bundle published before the canonical state travelled with it must not seed a run:
    regenerating from it rewrites every identity and drops every label."""
    bundle = tmp_path / "bundle"
    _write_bundled_source(bundle, "ppda.ocds", "UG", "20260830T020000Z", rows=12)
    data_root = tmp_path / "data"
    with pytest.raises(RuntimeError, match="canonical state"):
        restore_bundle(bundle=bundle, data_root=data_root)
    assert main(["restore", "--bundle", str(bundle), "--data-root", str(data_root)]) == 1
    result = restore_bundle(bundle=bundle, data_root=data_root, allow_fresh=True)
    assert result["canonical"] == []
