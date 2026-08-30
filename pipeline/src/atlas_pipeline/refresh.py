# SPDX-License-Identifier: Apache-2.0
"""Discover scheduled adapters and restore working state from a bundle."""

import json
import re
import shutil
from pathlib import Path

import yaml

from .adapters import accept_run
from .regenerate import _source_dir

CADENCES = ("weekly", "monthly", "quarterly", "annual", "all")
RUN_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
COUNTRY_PATTERN = re.compile(r"[A-Za-z]{2}")


def due_adapter_directories(packs_dir: Path, cadence: str) -> list[Path]:
    """Return adapter directories due for a cadence in stable path order."""
    if cadence not in CADENCES:
        raise ValueError(f"unsupported cadence: {cadence}")
    due = []
    for source_yml in sorted(Path(packs_dir).glob("*/sources/*/source.yml")):
        source = yaml.safe_load(source_yml.read_text()) or {}
        if cadence == "all" or source.get("cadence") == cadence:
            due.append(source_yml.parent)
    return due


def _safe_manifest_value(value: object, *, field: str, pattern: re.Pattern[str]) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value) or value in {".", ".."}:
        raise ValueError(f"invalid {field} in source manifest")
    return value


def run_outcome(results_path: Path) -> dict:
    """What a set of source runs adds up to.

    One publisher's export failing is an ordinary Tuesday, and refusing to regenerate over it
    would leave a whole country's data stale for a week. A source that failed keeps its last
    accepted run and is named here; the refresh goes on as long as something succeeded. Only a
    run where nothing succeeded has nothing to publish.
    """
    rows = []
    if results_path.exists():
        for line in results_path.read_text().splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                rows.append((parts[0], parts[2]))

    failed = [adapter for adapter, status in rows if status != "ok"]
    succeeded = len(rows) - len(failed)
    if not rows:
        state = "none"
    elif succeeded == 0:
        state = "blocked"
    elif failed:
        state = "partial"
    else:
        state = "ok"
    return {"attempted": len(rows), "succeeded": succeeded, "failed": failed, "state": state}


def outcome_sentence(outcome: dict) -> str:
    """One line for the run summary, in the words a reader of the run needs."""
    state = outcome["state"]
    if state == "partial":
        names = ", ".join(f"`{name}`" for name in outcome["failed"])
        return f"Partial refresh: {names} failed and kept the last accepted run."
    if state == "blocked":
        return "No due source succeeded, so nothing was regenerated."
    if state == "none":
        return "No source was due."
    return "Every due source succeeded."


def restore_bundle(*, bundle: Path, data_root: Path, allow_fresh: bool = False) -> dict:
    """Restore accepted source runs and durable canonical state from a bundle."""
    bundle = Path(bundle)
    data_root = Path(data_root)
    restored = []
    sources_dir = bundle / "sources"
    if sources_dir.exists():
        for bundled_source in sorted(path for path in sources_dir.iterdir() if path.is_dir()):
            manifest_path = bundled_source / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            slug = _safe_manifest_value(
                manifest.get("source"), field="source", pattern=RUN_ID_PATTERN
            )
            if bundled_source.name != slug:
                raise ValueError(
                    f"source manifest slug {slug} does not match bundle directory "
                    f"{bundled_source.name}"
                )
            country = _safe_manifest_value(
                manifest.get("country"), field="country", pattern=COUNTRY_PATTERN
            ).lower()
            run_id = _safe_manifest_value(
                manifest.get("run_id"), field="run_id", pattern=RUN_ID_PATTERN
            )
            source_dir = data_root / "sources" / country / _source_dir(slug)
            run_dir = source_dir / "runs" / run_id
            run_dir.mkdir(parents=True, exist_ok=True)
            for filename in ("records.parquet", "statements.parquet", "manifest.json"):
                source = bundled_source / filename
                if not source.is_file():
                    raise FileNotFoundError(source)
                shutil.copyfile(source, run_dir / filename)
            if not accept_run(source_dir, run_id, findings=[]):
                raise ValueError(f"bundled run is not acceptable: {slug} {run_id}")
            restored.append({"source": slug, "country": country.upper(), "run_id": run_id})

    canonical = []
    for filename in ("crosswalk.parquet", "labels.jsonl"):
        source = bundle / "canonical" / filename
        if source.is_file():
            destination = data_root / "canonical" / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            canonical.append(filename)
    if not allow_fresh and len(canonical) < 2:
        # Regenerating without the crosswalk rewrites every identity and without the labels
        # undoes every maintainer merge; only a first deployment may start from nothing.
        raise RuntimeError(
            "bundle carries no canonical state (crosswalk.parquet and labels.jsonl); "
            "refusing to restore, pass --allow-fresh for a first deployment"
        )
    return {"sources": restored, "canonical": canonical}
