"""Command line entry point: python -m atlas_pipeline run <adapter_dir> [--data-root DIR]."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from .adapters import load_adapter, run_adapter
from .conformance import check_run
from .regenerate import regenerate

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
    regen.add_argument("--pack", type=Path, required=True)
    regen.add_argument("--data-root", type=Path, default=Path("data"))
    regen.add_argument("--id", dest="regeneration_id")
    regen.add_argument(
        "--empty-since",
        action="append",
        default=[],
        help="slug=YYYY-MM-DD for registers returning nothing",
    )
    args = parser.parse_args(argv)

    if args.command == "regenerate":
        result = regenerate(
            pack_dir=args.pack,
            data_root=args.data_root,
            regeneration_id=args.regeneration_id,
            rubrics_dir=REPO / "rubrics",
            schema_path=REPO / "infra" / "d1" / "schema.sql",
            empty_since=dict(item.split("=", 1) for item in args.empty_since),
        )
        print(json.dumps(result.summary, indent=2))
        return 0

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
    )
    findings = check_run(args.adapter_dir, result.output_dir)
    print(json.dumps({"manifest": result.manifest, "conformance": findings}, indent=2))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
