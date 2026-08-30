"""Regeneration: union every loaded source, resolve, score, and write the serving SQL."""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from .adapters import STATEMENT_ARROW_SCHEMA, accepted_run
from .d1 import regeneration_sql, segment_rows, swap_sql
from .linkage import MODEL_VERSION as LINKAGE_MODEL_VERSION
from .linkage import name_candidates
from .resolve import pack_sources, resolve
from .score import load_rubric, score

# Formality first: Procurement Readiness reads the Formality value from the business.
PHASE0_RUBRICS = ("formality", "activity", "compliance_signals", "procurement_readiness")
# Regenerated tables dropped before a load so the free-plan peak stays under the cap.
# The main database also drops statements and refs so a layout from before the split can
# never inflate a load.
PRELUDE_DROPS = {
    "DB": ("scores", "segments", "businesses_fts", "statements", "refs"),
    "DB_STATEMENTS": ("statements",),
    "DB_SCORES": ("scores",),
}


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


def _load_labels(path: Path) -> list[dict]:
    """Maintainer verdicts, one JSON object per line, append-only; the latest per pair wins."""
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


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


@dataclass
class _PackInputs:
    pack_dir: Path
    pack: dict
    statements: list[dict]
    inputs: dict[str, str]
    sources: list[dict]


def _load_pack(pack_dir: Path, data_root: Path, empty_since: dict[str, str] | None) -> _PackInputs:
    """Accepted runs of one pack: statements, run ids per source and source rows."""
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
            f"no accepted run for any loaded source of {pack['country']}; "
            "refusing to regenerate an empty snapshot"
        )
    return _PackInputs(pack_dir, pack, statements, inputs, sources)


@dataclass
class _Combined:
    """One regeneration over several packs: resolved and scored per pack, served together."""

    businesses: list[dict] = field(default_factory=list)
    statements: list[dict] = field(default_factory=list)
    aliases: list[dict] = field(default_factory=list)
    scores: list[dict] = field(default_factory=list)
    candidates: list[dict] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)
    inputs: dict[str, str] = field(default_factory=dict)
    countries: list[str] = field(default_factory=list)
    coverage_meta: dict[str, str] = field(default_factory=dict)
    new_entities: list[str] = field(default_factory=list)


LINKAGE_CANDIDATE_THRESHOLD = 0.5  # name_candidates default; candidates below are not kept


def _methodology_meta(rubrics_dir: Path, packs: list[Path]) -> str:
    """What the methodology page shows: the rubric definitions, each pack's bindings and
    precedence contract, and the linkage model's thresholds, exactly as used in this run."""
    rubrics = []
    for name in PHASE0_RUBRICS:
        rubric = yaml.safe_load((rubrics_dir / name / "v1.yml").read_text())
        rubrics.append(
            {
                key: rubric[key]
                for key in ("name", "version", "title", "question", "max", "licence", "predicates")
            }
        )
    pack_entries = {}
    for pack_path in packs:
        pack = yaml.safe_load((pack_path / "pack.yml").read_text())
        pack_entries[pack["country"]] = {
            "name": pack.get("name"),
            "precedence": pack["precedence"],
            "bindings": yaml.safe_load((pack_path / "rubrics" / "bindings.yml").read_text()),
        }
    return _json(
        {
            "rubrics": rubrics,
            "packs": pack_entries,
            "linkage": {
                "model_version": LINKAGE_MODEL_VERSION,
                "candidate_threshold": LINKAGE_CANDIDATE_THRESHOLD,
                "review_band": [0.8, 0.95],
                "rule": "Names are compared with expert-set weights inside blocks that share a "
                "first token; the same register never pairs with itself. Candidates are shown, "
                "never merged: only an issuer-unique identifier or a maintainer label links "
                "two records.",
            },
        }
    )


def regenerate(
    *,
    pack_dir: Path | None = None,
    pack_dirs: list[Path] | None = None,
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
    packs = list(pack_dirs or []) + ([pack_dir] if pack_dir else [])
    if not packs:
        raise ValueError("regenerate needs at least one pack")

    crosswalk_path = data_root / "canonical" / "crosswalk.parquet"
    labels = _load_labels(data_root / "canonical" / "labels.jsonl")
    combined = _Combined()
    for pack_path in packs:
        loaded = _load_pack(pack_path, data_root, empty_since)
        country = loaded.pack["country"]
        resolution = resolve(
            loaded.statements,
            pack=loaded.pack,
            checked_sources=list(loaded.inputs),
            crosswalk=_load_crosswalk(crosswalk_path),
            labels=labels,
        )
        by_business: dict[str, list[dict]] = {}
        for s in resolution.statements:
            by_business.setdefault(s["atlas_id"], []).append(s)
        for name in PHASE0_RUBRICS:
            rubric = load_rubric(
                rubrics_dir / name / "v1.yml", pack_path / "rubrics" / "bindings.yml"
            )
            for b in resolution.businesses:
                result = score(
                    rubric, b, by_business.get(b["atlas_id"], []), evaluation_as_of=computed_at
                )
                combined.scores.append({"atlas_id": b["atlas_id"], **result})
                b.setdefault("scores", {})[name] = {
                    "value": result["value"],
                    "max": result["max"],
                    "checkable": result["checkable"],
                    "unknown": result["unknown"],
                    "version": result["version"],
                }
        _append_crosswalk(crosswalk_path, resolution, regeneration_id)
        combined.candidates += name_candidates(resolution.businesses)
        combined.businesses += resolution.businesses
        combined.statements += resolution.statements
        combined.aliases += resolution.aliases
        combined.new_entities += list(resolution.new_entities)
        combined.sources += loaded.sources
        combined.inputs.update(loaded.inputs)
        combined.countries.append(country)
        coverage = resolution.businesses[0]["coverage"]
        per_country = {
            f"coverage_applicable:{country}": _json(coverage["applicable"]),
            f"coverage_checked:{country}": _json(coverage["checked"]),
        }
        if not combined.coverage_meta:  # the first pack also fills the unsuffixed keys
            per_country |= {
                "coverage_applicable": _json(coverage["applicable"]),
                "coverage_checked": _json(coverage["checked"]),
            }
        combined.coverage_meta.update(per_country)

    resolution = combined
    scores = combined.scores
    inputs = combined.inputs
    sources = combined.sources
    out = data_root / "regen" / regeneration_id
    out.mkdir(parents=True, exist_ok=True)
    candidates = combined.candidates
    pq.write_table(
        pa.Table.from_pylist(
            [{**c, "comparison": _json(c["comparison"])} for c in candidates],
            schema=pa.schema(
                [
                    ("atlas_id_a", pa.string()),
                    ("atlas_id_b", pa.string()),
                    ("match_probability", pa.float64()),
                    ("match_weight", pa.float64()),
                    ("comparison", pa.string()),
                    ("blocking_rule", pa.string()),
                    ("model_version", pa.string()),
                ]
            ),
        ),
        out / "linkage_candidates.parquet",
    )
    pq.write_table(
        pa.Table.from_pylist(
            resolution.aliases,
            schema=pa.schema(
                [
                    ("atlas_id", pa.string()),
                    ("canonical_atlas_id", pa.string()),
                    ("reason", pa.string()),
                ]
            ),
        ),
        out / "aliases.parquet",
    )
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
    segments = segment_rows(resolution.businesses)
    pq.write_table(
        pa.Table.from_pylist(
            segments,
            schema=pa.schema(
                [
                    ("country", pa.string()),
                    ("sector_category", pa.string()),
                    ("sector_nature", pa.string()),
                    ("district", pa.string()),
                    ("division", pa.string()),
                    ("register", pa.string()),
                    ("business_count", pa.int64()),
                ]
            ),
        ),
        out / "segments.parquet",
    )

    finished = datetime.now(UTC)
    regeneration = {
        "id": regeneration_id,
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "finished_at": finished.isoformat().replace("+00:00", "Z"),
        "inputs": inputs,
        "packs": combined.countries,
    }
    # Free-plan size discipline: staged tables sit beside live ones during an import, so the
    # loader first drops the largest live table. The previous regeneration's stage.sql and
    # swap.sql stay on disk as the rollback path; trace reads fail closed during the load.
    load_order: dict[str, list[str]] = {}
    pack_meta = combined.coverage_meta | {"methodology": _methodology_meta(rubrics_dir, packs)}
    for database, prefix in (
        ("DB", ""),
        ("DB_STATEMENTS", "statements-"),
        ("DB_SCORES", "scores-"),
    ):
        sql = regeneration_sql(
            schema_path,
            regeneration,
            resolution.businesses,
            resolution.statements,
            scores,
            sources,
            database=database,
            candidates=candidates,
            aliases=resolution.aliases,
            segments=segments,
        )
        (out / f"{prefix}prelude.sql").write_text(
            "\n".join(f"DROP TABLE IF EXISTS {t};" for t in PRELUDE_DROPS[database]) + "\n"
        )
        (out / f"{prefix}stage.sql").write_text("\n".join(sql) + "\n")
        (out / f"{prefix}swap.sql").write_text(
            "\n".join(
                swap_sql(
                    schema_path,
                    regeneration,
                    database=database,
                    meta=pack_meta if database == "DB" else None,
                )
            )
            + "\n"
        )
        load_order[database] = [f"{prefix}prelude.sql", f"{prefix}stage.sql", f"{prefix}swap.sql"]
    summary = regeneration | {
        "counts": {
            "businesses": len(resolution.businesses),
            "statements": len(resolution.statements),
            "scores": len(scores),
            "segments": len(segments),
            "linkage_candidates": len(candidates),
            "aliases": len(resolution.aliases),
            "stage_statements": sum(1 for _ in open(out / "stage.sql"))
            + sum(1 for _ in open(out / "statements-stage.sql")),
        },
        "sources": sources,
        "new_entities": len(resolution.new_entities),
        "labels": len(labels),
        "load_order": load_order,
    }
    (out / "regeneration.json").write_text(json.dumps(summary, indent=2) + "\n")
    return Regeneration(out, summary)
