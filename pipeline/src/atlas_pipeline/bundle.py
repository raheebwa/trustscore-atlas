# SPDX-License-Identifier: Apache-2.0
"""Publish one regeneration as a self-describing download bundle."""

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

import pyarrow as pa
import pyarrow.csv as pacsv
import pyarrow.json as pajson
import pyarrow.parquet as pq
import yaml

CANONICAL_LICENSE = {
    "name": "CC-BY-4.0",
    "path": "https://creativecommons.org/licenses/by/4.0/",
    "title": "Creative Commons Attribution 4.0 International",
}
CANONICAL_PARQUETS = {
    "businesses": "businesses.parquet",
    "statements": "statements_resolved.parquet",
    "scores": "scores.parquet",
    "linkage_candidates": "linkage_candidates.parquet",
    "aliases": "aliases.parquet",
    "segments": "segments.parquet",
}
CSV_TWINS = ("businesses", "scores", "linkage_candidates", "aliases", "segments", "labels")
LABEL_SCHEMA = pa.schema(
    [
        ("atlas_id", pa.string()),
        ("candidate_atlas_id", pa.string()),
        ("verdict", pa.string()),
        ("labelled_at", pa.string()),
        ("labelled_by", pa.string()),
        ("note", pa.string()),
        ("decision", pa.string()),
    ]
)
OPERATOR_STATEMENT_SCHEMA = pa.schema(
    [
        ("atlas_id", pa.string()),
        ("field", pa.string()),
        ("value", pa.string()),
        ("claim_id", pa.string()),
        ("source_ref", pa.string()),
        ("asserted_at", pa.string()),
        ("operator_statement_id", pa.string()),
    ]
)
HASH_CHUNK_BYTES = 1024 * 1024


@dataclass
class Bundle:
    directory: Path
    manifest: dict


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(HASH_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def _file_metadata(path: Path, root: Path) -> dict:
    return {
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": _sha256(path),
    }


def _copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def _write_csv(parquet_path: Path, csv_path: Path) -> None:
    parquet = pq.ParquetFile(parquet_path)
    csv_schema = pa.schema(
        [
            pa.field(field.name, pa.string() if pa.types.is_nested(field.type) else field.type)
            for field in parquet.schema_arrow
        ]
    )
    options = pacsv.WriteOptions(delimiter=",", quoting_style="needed", quoting_header="needed")
    with pacsv.CSVWriter(csv_path, csv_schema, write_options=options) as writer:
        for batch in parquet.iter_batches(batch_size=65_536):
            columns = [
                (
                    pa.array(
                        [
                            json.dumps(value, sort_keys=True, separators=(",", ":"))
                            if value is not None
                            else None
                            for value in column.to_pylist()
                        ],
                        type=pa.string(),
                    )
                    if pa.types.is_nested(field.type)
                    else column
                )
                for field, column in zip(parquet.schema_arrow, batch.columns, strict=True)
            ]
            writer.write_batch(pa.RecordBatch.from_arrays(columns, schema=csv_schema))


def _write_labels(labels_jsonl: Path, labels_parquet: Path) -> None:
    if labels_jsonl.exists() and labels_jsonl.stat().st_size:
        table = pajson.read_json(
            labels_jsonl,
            parse_options=pajson.ParseOptions(
                explicit_schema=LABEL_SCHEMA, unexpected_field_behavior="ignore"
            ),
        ).select(LABEL_SCHEMA.names)
    else:
        table = pa.Table.from_pylist([], schema=LABEL_SCHEMA)
    pq.write_table(table, labels_parquet)


def _tableschema(schema: pa.Schema) -> dict:
    def table_type(dtype: pa.DataType) -> str:
        dtype = dtype.value_type if pa.types.is_dictionary(dtype) else dtype
        rules = (
            (pa.types.is_boolean, "boolean"),
            (pa.types.is_integer, "integer"),
            (lambda value: pa.types.is_floating(value) or pa.types.is_decimal(value), "number"),
            (lambda value: pa.types.is_date32(value) or pa.types.is_date64(value), "date"),
            (lambda value: pa.types.is_time32(value) or pa.types.is_time64(value), "time"),
            (pa.types.is_timestamp, "datetime"),
            (pa.types.is_duration, "duration"),
            (
                lambda value: (
                    pa.types.is_list(value)
                    or pa.types.is_large_list(value)
                    or pa.types.is_fixed_size_list(value)
                ),
                "array",
            ),
            (lambda value: pa.types.is_struct(value) or pa.types.is_map(value), "object"),
            (
                lambda value: (
                    pa.types.is_string(value)
                    or pa.types.is_large_string(value)
                    or pa.types.is_binary(value)
                    or pa.types.is_large_binary(value)
                    or pa.types.is_fixed_size_binary(value)
                ),
                "string",
            ),
            (lambda _value: True, "any"),
        )
        return next(kind for predicate, kind in rules if predicate(dtype))

    return {"fields": [{"name": field.name, "type": table_type(field.type)} for field in schema]}


def _resource(
    *,
    path: Path,
    root: Path,
    schema: pa.Schema,
    licenses: list[dict],
    attribution: str | None = None,
) -> dict:
    metadata = _file_metadata(path, root)
    suffix = path.suffix.removeprefix(".")
    mediatype = {
        "parquet": "application/vnd.apache.parquet",
        "jsonl": "application/x-ndjson",
    }.get(suffix, "text/csv; charset=utf-8")
    resource = {
        "name": metadata["path"].replace("/", "-").replace("_", "-").replace(".", "-"),
        "path": metadata["path"],
        "format": suffix,
        "mediatype": mediatype,
        "bytes": metadata["bytes"],
        "hash": f"sha256:{metadata['sha256']}",
        "schema": _tableschema(schema),
        "licenses": licenses,
    }
    if attribution:
        resource["attribution"] = attribution
    return resource


def _source_metadata(regeneration: dict, *, data_root: Path, packs_root: Path) -> list[dict]:
    sources = []
    for slug, run_id in regeneration["inputs"].items():
        source = None
        for country in regeneration["packs"]:
            source_yml = (
                packs_root / country.lower() / "sources" / slug.replace(".", "_") / "source.yml"
            )
            if source_yml.exists():
                source = yaml.safe_load(source_yml.read_text())
                break
        if source is None:
            raise FileNotFoundError(f"source.yml for {slug}")
        country = source["country"].upper()
        run_dir = data_root / "sources" / country.lower() / slug.replace(".", "_") / "runs" / run_id
        manifest = json.loads((run_dir / "manifest.json").read_text())
        sources.append(
            source
            | {"country": country, "run_id": run_id, "run_dir": run_dir, "manifest": manifest}
        )
    return sorted(sources, key=lambda source: (source["country"], source["slug"]))


def _write_license(path: Path) -> None:
    path.write_text(
        "TrustScore Atlas canonical layer\n"
        "================================\n\n"
        "The canonical layer is licensed under the Creative Commons Attribution 4.0 "
        "International licence (CC BY 4.0). You may share and adapt it for any purpose, "
        "including commercially, provided that you give appropriate credit, link to the "
        "licence, and indicate whether changes were made. No warranties are given.\n\n"
        "Licence summary and legal code: https://creativecommons.org/licenses/by/4.0/\n\n"
        "Per-source records and statements retain the licence of their publisher. Those "
        "licences and the required attribution lines are listed in SOURCES.md.\n"
    )


def _write_sources(path: Path, sources: list[dict]) -> None:
    lines = ["# Sources", ""]
    current_country = None
    for source in sources:
        if source["country"] != current_country:
            current_country = source["country"]
            lines += [f"## {current_country}", ""]
        pulled_at = source["manifest"].get("pulled_at", source["manifest"]["started_at"])
        lines += [
            f"- **{source['publisher']}: {source['title']}**",
            f"  URL: {source['url']}",
            f"  Licence: {source['licence']}",
            f"  Attribution: {source['attribution']}",
            f"  Run ID: {source['run_id']}",
            f"  Pulled at: {pulled_at}",
            "",
        ]
    path.write_text("\n".join(lines))


def publish_bundle(
    *,
    regeneration_id: str,
    data_root: Path,
    out: Path,
    packs_root: Path,
) -> Bundle:
    data_root = Path(data_root)
    out = Path(out)
    regeneration_dir = data_root / "regen" / regeneration_id
    regeneration = json.loads((regeneration_dir / "regeneration.json").read_text())
    if regeneration["id"] != regeneration_id:
        raise ValueError(
            f"regeneration id {regeneration['id']} does not match requested {regeneration_id}"
        )
    if out.exists() and any(out.iterdir()):
        raise FileExistsError(f"bundle output is not empty: {out}")
    canonical_dir = out / "canonical"
    canonical_dir.mkdir(parents=True, exist_ok=True)

    parquet_schemas: dict[str, pa.Schema] = {}
    for name, source_name in CANONICAL_PARQUETS.items():
        destination = canonical_dir / f"{name}.parquet"
        _copy(regeneration_dir / source_name, destination)
        parquet_schemas[name] = pq.read_schema(destination)
    crosswalk = canonical_dir / "crosswalk.parquet"
    _copy(data_root / "canonical" / "crosswalk.parquet", crosswalk)
    parquet_schemas["crosswalk"] = pq.read_schema(crosswalk)
    labels_jsonl_source = data_root / "canonical" / "labels.jsonl"
    labels_jsonl = canonical_dir / "labels.jsonl"
    if labels_jsonl_source.is_file():
        _copy(labels_jsonl_source, labels_jsonl)
    labels_parquet = canonical_dir / "labels.parquet"
    _write_labels(labels_jsonl_source, labels_parquet)
    parquet_schemas["labels"] = pq.read_schema(labels_parquet)
    # What maintainers approved travels with the bundle: a restore brings it back, and a rollback
    # can be compared against what the bundle it is rolling to actually carried.
    operator_statements_source = data_root / "canonical" / "operator_statements.jsonl"
    operator_statements = canonical_dir / "operator_statements.jsonl"
    if operator_statements_source.is_file():
        _copy(operator_statements_source, operator_statements)
    for name in CSV_TWINS:
        _write_csv(canonical_dir / f"{name}.parquet", canonical_dir / f"{name}.csv")

    sources = _source_metadata(regeneration, data_root=data_root, packs_root=Path(packs_root))
    for source in sources:
        source_out = out / "sources" / source["slug"]
        for filename in ("records.parquet", "statements.parquet", "manifest.json"):
            _copy(source["run_dir"] / filename, source_out / filename)

    _write_license(out / "LICENSE")
    _write_sources(out / "SOURCES.md", sources)

    resources = []
    canonical_licenses = [CANONICAL_LICENSE]
    for name, schema in parquet_schemas.items():
        parquet_path = canonical_dir / f"{name}.parquet"
        resources.append(
            _resource(
                path=parquet_path,
                root=out,
                schema=schema,
                licenses=canonical_licenses,
            )
        )
        csv_path = canonical_dir / f"{name}.csv"
        if csv_path.exists():
            resources.append(
                _resource(
                    path=csv_path,
                    root=out,
                    schema=schema,
                    licenses=canonical_licenses,
                )
            )
    if labels_jsonl.is_file():
        resources.append(
            _resource(
                path=labels_jsonl,
                root=out,
                schema=LABEL_SCHEMA,
                licenses=canonical_licenses,
            )
        )
    if operator_statements.is_file():
        resources.append(
            _resource(
                path=operator_statements,
                root=out,
                schema=OPERATOR_STATEMENT_SCHEMA,
                licenses=canonical_licenses,
            )
        )
    for source in sources:
        source_licenses = [{"name": source["licence"]}]
        for filename in ("records.parquet", "statements.parquet"):
            path = out / "sources" / source["slug"] / filename
            resources.append(
                _resource(
                    path=path,
                    root=out,
                    schema=pq.read_schema(path),
                    licenses=source_licenses,
                    attribution=source["attribution"],
                )
            )

    datapackage = {
        "profile": "data-package",
        "name": f"trustscore-atlas-{regeneration_id}",
        "title": f"TrustScore Atlas regeneration {regeneration_id}",
        "description": (
            "Canonical and accepted-source data for one regeneration. A statements CSV is "
            "intentionally omitted because the statements table is too large for a practical "
            "CSV download."
        ),
        "version": regeneration_id,
        "created": regeneration["finished_at"],
        "licenses": canonical_licenses,
        "sources": [{"title": source["title"], "path": source["url"]} for source in sources],
        "resources": resources,
    }
    (out / "datapackage.json").write_text(json.dumps(datapackage, indent=2) + "\n")

    files = [
        _file_metadata(path, out)
        for path in sorted(out.rglob("*"))
        if path.is_file() and path != out / "manifest.json"
    ]
    manifest = {
        "regeneration_id": regeneration_id,
        "packs": regeneration["packs"],
        "files": files,
        "file_count": len(files),
        "total_bytes": sum(file["bytes"] for file in files),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return Bundle(out, manifest)
