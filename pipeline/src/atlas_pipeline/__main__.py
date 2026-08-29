"""Command line entry point: python -m atlas_pipeline run <adapter_dir> [--data-root DIR]."""

import argparse
import json
import sys
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
        "--replay-from", type=Path, help="manifest.json of a run whose raw objects to reuse"
    )
    regen = sub.add_parser("regenerate", help="resolve, score and write serving sql for a pack")
    regen.add_argument("--pack", type=Path, required=True)
    regen.add_argument("--data-root", type=Path, default=Path("data"))
    regen.add_argument("--id", dest="regeneration_id")
    args = parser.parse_args(argv)

    if args.command == "regenerate":
        result = regenerate(
            pack_dir=args.pack,
            data_root=args.data_root,
            regeneration_id=args.regeneration_id,
            rubrics_dir=REPO / "rubrics",
            schema_path=REPO / "infra" / "d1" / "schema.sql",
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
    )
    findings = check_run(args.adapter_dir, result.output_dir)
    print(json.dumps({"manifest": result.manifest, "conformance": findings}, indent=2))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
