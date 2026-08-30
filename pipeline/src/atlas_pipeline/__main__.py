"""Command line entry point for the Atlas data pipeline."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from . import boundaries
from .adapters import accept_run, load_adapter, run_adapter
from .bundle import publish_bundle
from .churn_guard import check_churn, report_json
from .conformance import check_run
from .maintainer_labels import compile_maintainer_labels
from .refresh import CADENCES, due_adapter_directories, restore_bundle
from .regenerate import regenerate
from .regeneration_requests import (
    REQUEST_KINDS,
    REQUEST_STATUSES,
    mark_request,
    next_pending_request,
)

REPO = Path(__file__).resolve().parents[3]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="atlas_pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="run one adapter and write its outputs")
    run.add_argument("adapter_dir", type=Path)
    run.add_argument("--data-root", type=Path, default=Path("data"))
    run.add_argument("--param", action="append", default=[], help="key=v1,v2 passed to the adapter")
    run.add_argument("--previous-manifest", type=Path)
    run.add_argument(
        "--snapshot", type=Path, help="dated typed table (parquet) loaded instead of a pull"
    )
    run.add_argument("--snapshot-at", help="original pull time of the snapshot, ISO 8601 UTC")
    run.add_argument("--snapshot-ref", help="source reference recorded on every snapshot statement")
    run.add_argument(
        "--observed-at", help="when raw material given via params was received, ISO 8601 UTC"
    )
    run.add_argument("--observation-note", help="what was received when, shown on the sources page")
    run.add_argument(
        "--replay-from", type=Path, help="manifest.json of a run whose raw objects to reuse"
    )
    regen = sub.add_parser("regenerate", help="resolve, score and write serving sql for a pack")
    regen.add_argument(
        "--pack",
        type=Path,
        action="append",
        required=True,
        help="pack directory; repeat to serve several countries from one regeneration",
    )
    regen.add_argument("--data-root", type=Path, default=Path("data"))
    regen.add_argument("--id", dest="regeneration_id")
    regen.add_argument(
        "--empty-since",
        action="append",
        default=[],
        help="slug=YYYY-MM-DD for registers returning nothing",
    )
    bundle = sub.add_parser("bundle", help="publish one regeneration as a download bundle")
    bundle.add_argument("--regeneration", required=True, help="regeneration id to publish")
    bundle.add_argument("--data-root", type=Path, default=Path("data"))
    bundle.add_argument("--out", type=Path, required=True)
    due = sub.add_parser("due", help="list adapter directories due for a cadence")
    due.add_argument("--cadence", required=True, choices=CADENCES)
    due.add_argument("--packs-dir", type=Path, default=Path("packs"))
    restore = sub.add_parser("restore", help="restore working state from a download bundle")
    restore.add_argument("--bundle", type=Path, required=True)
    restore.add_argument("--data-root", type=Path, required=True)
    restore.add_argument(
        "--allow-fresh",
        action="store_true",
        help="accept a bundle without canonical state (first deployment only)",
    )
    guard = sub.add_parser(
        "guard", help="refuse a regeneration that rewrites identities or drops labels"
    )
    guard.add_argument("--regeneration", required=True)
    guard.add_argument("--data-root", type=Path, required=True)
    guard.add_argument("--previous-bundle", type=Path, required=True)
    guard.add_argument("--out", type=Path)
    labels = sub.add_parser("labels", help="manage canonical maintainer labels")
    label_commands = labels.add_subparsers(dest="labels_command", required=True)
    compile_labels = label_commands.add_parser("compile", help="compile new maintainer labels")
    compile_labels.add_argument("--data-root", type=Path, default=Path("data"))
    compile_labels.add_argument("--regeneration", required=True)
    requests = sub.add_parser("requests", help="manage regeneration requests")
    request_commands = requests.add_subparsers(dest="requests_command", required=True)
    next_request = request_commands.add_parser("next", help="print the oldest pending request")
    next_request.add_argument("--data-root", type=Path, default=Path("data"))
    next_request.add_argument("--kind", choices=REQUEST_KINDS)
    mark = request_commands.add_parser("mark", help="append a request status event")
    mark.add_argument("--request-id", required=True)
    mark.add_argument("--status", required=True, choices=REQUEST_STATUSES)
    mark.add_argument("--note")
    boundaries_cmd = sub.add_parser("boundaries", help="simplify and write topojson boundaries")
    boundaries_cmd.add_argument("--input", required=True)
    boundaries_cmd.add_argument("--level", required=True)
    boundaries_cmd.add_argument("--output", required=True)
    boundaries_cmd.add_argument(
        "--tolerance",
        type=float,
        default=0.0,
        help="Douglas-Peucker tolerance in degrees",
    )
    boundaries_cmd.add_argument("--max-bytes", type=int)
    args = parser.parse_args(argv)

    if args.command == "regenerate":
        result = regenerate(
            pack_dirs=args.pack,
            data_root=args.data_root,
            regeneration_id=args.regeneration_id,
            rubrics_dir=REPO / "rubrics",
            schema_path=REPO / "infra" / "d1" / "schema.sql",
            empty_since=dict(item.split("=", 1) for item in args.empty_since),
        )
        print(json.dumps(result.summary, indent=2))
        return 0
    if args.command == "bundle":
        result = publish_bundle(
            regeneration_id=args.regeneration,
            data_root=args.data_root,
            out=args.out,
            packs_root=REPO / "packs",
        )
        print(json.dumps(result.manifest, indent=2))
        return 0
    if args.command == "due":
        for adapter_dir in due_adapter_directories(args.packs_dir, args.cadence):
            print(adapter_dir)
        return 0
    if args.command == "restore":
        try:
            result = restore_bundle(
                bundle=args.bundle, data_root=args.data_root, allow_fresh=args.allow_fresh
            )
        except RuntimeError as error:
            print(error, file=sys.stderr)
            return 1
        print(json.dumps(result, indent=2))
        return 0
    if args.command == "guard":
        report = check_churn(
            regeneration_dir=args.data_root / "regen" / args.regeneration,
            previous_bundle=args.previous_bundle,
            labels_file=args.data_root / "canonical" / "labels.jsonl",
        )
        text = report_json(report)
        print(text)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(text + "\n")
        return 0 if report.ok else 1
        return 0
    if args.command == "labels":
        compiled = compile_maintainer_labels(
            data_root=args.data_root,
            regeneration_id=args.regeneration,
        )
        print(json.dumps({"compiled": len(compiled)}))
        return 0
    if args.command == "requests":
        if args.requests_command == "next":
            request = next_pending_request(data_root=args.data_root, kind=args.kind)
            if request is not None:
                print(json.dumps(request))
            return 0
        event = mark_request(request_id=args.request_id, status=args.status, note=args.note)
        print(json.dumps(event))
        return 0
    if args.command == "boundaries":
        return boundaries.main(
            [
                "--input",
                str(args.input),
                "--level",
                args.level,
                "--output",
                str(args.output),
                "--tolerance",
                str(args.tolerance),
            ]
            + (["--max-bytes", str(args.max_bytes)] if args.max_bytes is not None else [])
        )

    params = {}
    for item in args.param:
        key, _, value = item.partition("=")
        params[key] = value.split(",")
    previous = json.loads(args.previous_manifest.read_text()) if args.previous_manifest else None
    spec = load_adapter(args.adapter_dir)
    result = run_adapter(
        spec,
        data_root=args.data_root,
        params=params,
        previous_manifest=previous,
        replay_from=args.replay_from,
        snapshot=args.snapshot,
        snapshot_at=(
            datetime.fromisoformat(args.snapshot_at.replace("Z", "+00:00"))
            if args.snapshot_at
            else None
        ),
        snapshot_ref=args.snapshot_ref,
        observed_at=(
            datetime.fromisoformat(args.observed_at.replace("Z", "+00:00"))
            if args.observed_at
            else None
        ),
        observation_note=args.observation_note,
        accept=False,
    )
    findings = check_run(args.adapter_dir, result.output_dir)
    accepted = accept_run(
        result.output_dir.parents[1], result.manifest["run_id"], findings=findings
    )
    print(
        json.dumps(
            {"manifest": result.manifest, "conformance": findings, "accepted": accepted}, indent=2
        )
    )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
