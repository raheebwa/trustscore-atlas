"""Regeneration: union every loaded source, resolve, score, and write the serving SQL."""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from .adapters import STATEMENT_ARROW_SCHEMA, accepted_run
from .d1 import regeneration_sql, swap_sql
from .resolve import pack_sources, resolve
from .score import load_rubric, score

PHASE0_RUBRICS = ("formality",)
# Regenerated tables dropped before a load so the free-plan peak stays under the cap.
PRELUDE_DROPS = ("statements", "scores", "businesses_fts")


@dataclass
class Regeneration:
    directory: Path
    summary: dict


def _source_dir(slug: str) -> str:
    return slug.replace(".", "_")


def _json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _source_status(
    slug: str, manifest: dict, empty_since: dict[str, str]
) -> tuple[str, str | None]:
    """A snapshot run keeps the register honest: the source is stale, with the original pull
    date and, when known, the date the register started returning nothing."""
    snapshot = manifest.get("snapshot")
    observation = manifest.get("observation")
    if not snapshot and not observation:
        return "fresh", None
    if observation:
        note = observation["note"]
        if slug in empty_since and empty_since[slug] not in note:
            note += f"; register returning nothing since {empty_since[slug]}"
        return "stale", note
    observed = snapshot["observed_at"][:10]
    note = f"last successful pull {observed}"
    if slug in empty_since:
        note += f"; portal returning empty results since {empty_since[slug]}"
    return "stale", note


def _placeholder(key: str) -> str | None:
    return "unknown" if key in ("publisher", "title", "url", "licence", "cadence") else None


def _verify_checksums(run_dir: Path, manifest: dict) -> None:
    for name, expected in (
        ("records.parquet", manifest["checksums"]["records_parquet"]),
        ("statements.parquet", manifest["checksums"]["statements_parquet"]),
    ):
        actual = hashlib.sha256((run_dir / name).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"checksum mismatch for {run_dir / name}; refusing to load")


def _load_crosswalk(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    table = pq.read_table(path, columns=["entity_id", "atlas_id"])
    return dict(
        zip(
            table.column("entity_id").to_pylist(), table.column("atlas_id").to_pylist(), strict=True
        )
    )


def _append_crosswalk(path: Path, resolution, regeneration_id: str) -> None:
    """Append-only: first-seen entities get a row; existing rows are never rewritten."""
    if not resolution.new_entities and path.exists():
        return
    new_rows = [
        {
            "entity_id": e,
            "atlas_id": resolution.crosswalk[e],
            "first_regeneration_id": regeneration_id,
        }
        for e in resolution.new_entities
    ]
    schema = pa.schema(
        [
            ("entity_id", pa.string()),
            ("atlas_id", pa.string()),
            ("first_regeneration_id", pa.string()),
        ]
    )
    existing = pq.read_table(path).to_pylist() if path.exists() else []
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(pa.Table.from_pylist(existing + new_rows, schema=schema), tmp)
    tmp.replace(path)


def regenerate(
    *,
    pack_dir: Path,
    data_root: Path,
    regeneration_id: str | None = None,
    computed_at: str | None = None,
    rubrics_dir: Path,
    schema_path: Path,
    empty_since: dict[str, str] | None = None,
) -> Regeneration:
    started = datetime.now(UTC)
    regeneration_id = regeneration_id or started.strftime("%Y%m%dT%H%M%SZ")
    computed_at = computed_at or started.isoformat().replace("+00:00", "Z")
    pack = yaml.safe_load((pack_dir / "pack.yml").read_text())
    iso2 = pack["country"].lower()

    statements: list[dict] = []
    inputs: dict[str, str] = {}
    sources: list[dict] = []
    for entry in pack_sources(pack):
        slug, state = entry["slug"], entry["state"]
        source_yml = pack_dir / "sources" / _source_dir(slug) / "source.yml"
        source = (
            yaml.safe_load(source_yml.read_text())
            if source_yml.exists()
            else {"slug": slug, "country": pack["country"]}
        )
        row = {
            k: source.get(k, _placeholder(k))
            for k in (
                "slug",
                "country",
                "publisher",
                "title",
                "url",
                "licence",
                "cadence",
                "coverage",
            )
        }
        source_dir = data_root / "sources" / iso2 / _source_dir(slug)
        run_dir = accepted_run(source_dir) if state == "loaded" else None
        if run_dir is None:
            sources.append(
                row | {"adapter_version": source.get("adapter_version"), "status": state}
            )
            continue
        manifest = json.loads((run_dir / "manifest.json").read_text())
        _verify_checksums(run_dir, manifest)
        statements += pq.read_table(run_dir / "statements.parquet").to_pylist()
        inputs[slug] = manifest["run_id"]
        status, note = _source_status(slug, manifest, empty_since or {})
        sources.append(
            row
            | {
                "last_run_id": manifest["run_id"],
                "last_run_at": manifest["started_at"],
                "row_count": manifest["rows"],
                "adapter_version": manifest["adapter_version"],
                "status": status,
                "status_note": note,
            }
        )

    if not statements:
        raise RuntimeError(
            "no accepted run for any loaded source; refusing to regenerate an empty snapshot"
        )
    crosswalk_path = data_root / "canonical" / "crosswalk.parquet"
    crosswalk = _load_crosswalk(crosswalk_path)
    resolution = resolve(statements, pack=pack, checked_sources=list(inputs), crosswalk=crosswalk)
    by_business: dict[str, list[dict]] = {}
    for s in resolution.statements:
        by_business.setdefault(s["atlas_id"], []).append(s)
    scores: list[dict] = []
    for name in PHASE0_RUBRICS:
        rubric = load_rubric(rubrics_dir / name / "v1.yml", pack_dir / "rubrics" / "bindings.yml")
        for b in resolution.businesses:
            result = score(
                rubric, b, by_business.get(b["atlas_id"], []), evaluation_as_of=computed_at
            )
            scores.append({"atlas_id": b["atlas_id"], **result})

    out = data_root / "regen" / regeneration_id
    out.mkdir(parents=True, exist_ok=True)
    _append_crosswalk(crosswalk_path, resolution, regeneration_id)
    pq.write_table(
        pa.Table.from_pylist(
            [
                {
                    **{k: v for k, v in b.items() if not isinstance(v, dict | list)},
                    "name_variants": _json(b["name_variants"]),
                    "identifiers": _json(b["identifiers"]),
                    "coverage": _json(b["coverage"]),
                    "sector": _json(b.get("sector", {})),
                    "location": _json(b.get("location", {})),
                }
                for b in resolution.businesses
            ]
        ),
        out / "businesses.parquet",
    )
    pq.write_table(
        pa.Table.from_pylist(
            [
                {"atlas_id": b["atlas_id"], **i}
                for b in resolution.businesses
                for i in b["identifiers"]
            ],
            schema=pa.schema(
                [
                    ("atlas_id", pa.string()),
                    ("scheme", pa.string()),
                    ("value", pa.string()),
                    ("source", pa.string()),
                ]
            ),
        ),
        out / "identifiers.parquet",
    )
    pq.write_table(
        pa.Table.from_pylist(
            resolution.statements,
            schema=STATEMENT_ARROW_SCHEMA.append(pa.field("atlas_id", pa.string())),
        ),
        out / "statements_resolved.parquet",
    )
    pq.write_table(
        pa.Table.from_pylist(
            [
                {**s, "coverage": _json(s["coverage"]), "evidence": _json(s["evidence"])}
                for s in scores
            ]
        ),
        out / "scores.parquet",
    )

    finished = datetime.now(UTC)
    regeneration = {
        "id": regeneration_id,
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "finished_at": finished.isoformat().replace("+00:00", "Z"),
        "inputs": inputs,
    }
    stage = regeneration_sql(
        schema_path, regeneration, resolution.businesses, resolution.statements, scores, sources
    )
    # Free-plan size discipline: staged tables sit beside live ones during an import, so the
    # loader first drops the largest live table. The previous regeneration's stage.sql and
    # swap.sql stay on disk as the rollback path; trace reads fail closed during the load.
    (out / "prelude.sql").write_text(
        "\n".join(f"DROP TABLE IF EXISTS {table};" for table in PRELUDE_DROPS) + "\n"
    )
    (out / "stage.sql").write_text("\n".join(stage) + "\n")
    (out / "swap.sql").write_text("\n".join(swap_sql(schema_path, regeneration)) + "\n")
    summary = regeneration | {
        "counts": {
            "businesses": len(resolution.businesses),
            "statements": len(resolution.statements),
            "scores": len(scores),
            "stage_statements": len(stage),
        },
        "sources": sources,
        "new_entities": len(resolution.new_entities),
        "load_order": ["prelude.sql", "stage.sql", "swap.sql"],
    }
    (out / "regeneration.json").write_text(json.dumps(summary, indent=2) + "\n")
    return Regeneration(out, summary)
