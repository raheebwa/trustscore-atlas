"""Load an adapter directory and run it through the framework."""

import importlib.util
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType

import pyarrow as pa
import pyarrow.parquet as pq
import yaml
from jsonschema import Draft202012Validator

from . import __version__
from .context import Context, Fetcher, RawStore
from .mapping import build_statements, key_hash
from .pii import apply_posture

SCHEMAS = Path(__file__).resolve().parents[3] / "schemas"

STATEMENT_ARROW_SCHEMA = pa.schema(
    [
        ("statement_id", pa.string()),
        ("entity_id", pa.string()),
        ("country", pa.string()),
        ("field", pa.string()),
        ("value", pa.string()),
        ("source", pa.string()),
        ("source_ref", pa.string()),
        ("source_record_id", pa.string()),
        ("asserted_at", pa.timestamp("us", tz="UTC")),
        ("licence", pa.string()),
        ("precedence", pa.int16()),
        ("confidence", pa.string()),
    ]
)


def _schema(name: str) -> dict:
    return json.loads((SCHEMAS / f"{name}.schema.json").read_text())


@dataclass
class AdapterSpec:
    directory: Path
    source: dict
    schema: dict
    mapping: dict
    pack: dict
    module: ModuleType

    @property
    def slug_dir(self) -> str:
        return self.directory.name

    @property
    def iso2(self) -> str:
        return self.pack["country"].lower()


@dataclass
class RunResult:
    output_dir: Path
    raw_dir: Path
    manifest: dict


def load_adapter(adapter_dir: Path) -> AdapterSpec:
    adapter_dir = Path(adapter_dir).resolve()
    source = yaml.safe_load((adapter_dir / "source.yml").read_text())
    Draft202012Validator(_schema("source")).validate(source)
    schema = yaml.safe_load((adapter_dir / "schema.yml").read_text())
    mapping = yaml.safe_load((adapter_dir / "statements.map.yml").read_text())
    pack = yaml.safe_load((adapter_dir.parents[1] / "pack.yml").read_text())
    spec = importlib.util.spec_from_file_location(
        f"atlas_adapter_{adapter_dir.name}", adapter_dir / "adapter.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return AdapterSpec(adapter_dir, source, schema, mapping, pack, module)


def raw_dir_for(manifest_path: Path, run_id: str) -> Path:
    """Map a run manifest path to the raw directory of that run.

    sources/<iso2>/<slug>/runs/<run_id>/manifest.json -> raw/<iso2>/<slug>/<run_id>
    """
    manifest_path = Path(manifest_path)
    source_dir = manifest_path.parents[2]
    data_root = source_dir.parents[2]
    return data_root / "raw" / source_dir.parent.name / source_dir.name / run_id


def accepted_run(source_dir: Path) -> Path | None:
    """The run directory the accepted pointer names, or None when no run has been accepted."""
    pointer = Path(source_dir) / "accepted.json"
    if not pointer.exists():
        return None
    return Path(source_dir) / "runs" / json.loads(pointer.read_text())["run_id"]


def replay_fetcher(manifest_path: Path) -> Fetcher:
    """Serve previously fetched raw objects by URL, so a mapping fix needs no re-crawl."""
    manifest_path = Path(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    raw_dir = raw_dir_for(manifest_path, manifest["run_id"])
    by_url = {o["url"]: raw_dir / o["name"] for o in manifest["raw_objects"] if "url" in o}

    def fetch(url: str) -> bytes:
        if url not in by_url:
            raise KeyError(f"no raw object recorded for {url} in run {manifest['run_id']}")
        return by_url[url].read_bytes()

    return fetch


def _typed_records(spec: AdapterSpec, rows: list[dict], salt: str) -> list[dict]:
    pii = spec.source["pii"]
    columns = [f["name"] for f in spec.schema["fields"]]
    required = {
        f["name"] for f in spec.schema["fields"] if f.get("constraints", {}).get("required")
    }
    entity = spec.mapping["entity_id"]
    by_id: dict[str, dict] = {}
    for row in rows:
        record = apply_posture(
            row, excluded=pii["excluded_columns"], hashed=pii["hashed_columns"], salt=salt
        )
        record["record_id"] = key_hash(record, spec.mapping["record_id"]["columns"])
        record["_entity_key"] = key_hash(record, entity["columns"], entity.get("normalise", []))
        for name in required:
            if not record.get(name):
                raise ValueError(f"record {record['record_id']} missing required column {name}")
        by_id.setdefault(
            record["record_id"],
            {c: record.get(c) for c in columns} | {"_entity_key": record["_entity_key"]},
        )
    return [by_id[k] for k in sorted(by_id)]


def _write_parquet(path: Path, rows: list[dict], schema: pa.Schema) -> str:
    table = pa.Table.from_pylist(rows, schema=schema)
    pq.write_table(table, path)
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_adapter(
    spec: AdapterSpec,
    *,
    data_root: Path,
    run_id: str | None = None,
    started_at: datetime | None = None,
    fetcher: Fetcher | None = None,
    salt: str | None = None,
    params: dict | None = None,
    previous_manifest: dict | None = None,
    replay_from: Path | None = None,
) -> RunResult:
    if replay_from is not None and started_at is None:
        # A replay re-derives records from the original observation; the assertion time is the
        # original pull time, so outputs stay byte-identical without a re-crawl.
        original = json.loads(Path(replay_from).read_text())
        started_at = datetime.fromisoformat(original["started_at"].replace("Z", "+00:00"))
    started_at = started_at or datetime.now(UTC)
    run_id = run_id or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    salt = salt or os.environ.get("ATLAS_LINKAGE_SALT")
    if not salt:
        raise RuntimeError("ATLAS_LINKAGE_SALT is not set; refusing to hash linkage columns")
    if replay_from is not None:
        fetcher = replay_fetcher(replay_from)
    elif fetcher is None:
        from .http import make_fetcher

        fetcher = make_fetcher()

    data_root = Path(data_root)
    raw_dir = data_root / "raw" / spec.iso2 / spec.slug_dir / run_id
    source_dir = data_root / "sources" / spec.iso2 / spec.slug_dir
    output_dir = source_dir / "runs" / run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    ctx = Context(fetcher=fetcher, raw=RawStore(raw_dir), params=params or {})
    spec.module.run(ctx)

    records = _typed_records(spec, ctx.records, salt)
    statements = build_statements(records, spec.mapping, spec.source, started_at)
    record_columns = [f["name"] for f in spec.schema["fields"]]
    record_schema = pa.schema([(c, pa.string()) for c in record_columns])
    records_sha = _write_parquet(
        output_dir / "records.parquet",
        [{c: r.get(c) for c in record_columns} for r in records],
        record_schema,
    )
    statements_sha = _write_parquet(
        output_dir / "statements.parquet", statements, STATEMENT_ARROW_SCHEMA
    )

    flags: list[str] = []
    previous_rows = (previous_manifest or {}).get("rows")
    if previous_rows:
        drift = abs(len(records) - previous_rows) / previous_rows
        if drift > spec.source["row_count_tolerance"]:
            flags.append("row_count_out_of_tolerance")

    manifest = {
        "run_id": run_id,
        "source": spec.source["slug"],
        "country": spec.source["country"],
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "finished_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "rows": len(records),
        "statements": len(statements),
        "rows_dropped": ctx.dropped,
        "raw_objects": ctx.raw.objects,
        "adapter_version": spec.source["adapter_version"],
        "framework_version": __version__,
        "checksums": {"records_parquet": records_sha, "statements_parquet": statements_sha},
        "flags": flags,
    }
    Draft202012Validator(_schema("manifest")).validate(manifest)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if not flags:
        # Immutable run outputs are complete; move the accepted pointer atomically.
        pointer = source_dir / "accepted.json"
        tmp = pointer.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps({"run_id": run_id, "accepted_at": manifest["finished_at"]}) + "\n"
        )
        os.replace(tmp, pointer)
    return RunResult(output_dir=output_dir, raw_dir=raw_dir, manifest=manifest)
