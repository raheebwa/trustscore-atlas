"""The six adapter conformance checks from the adapter contract."""

import json
import re
from pathlib import Path

import pyarrow.parquet as pq
import yaml
from jsonschema import Draft202012Validator

from .adapters import SCHEMAS

ALL_CHECKS = ("outputs", "provenance", "exclusions", "identifiers", "idempotent", "tolerance")


def _load(adapter_dir: Path) -> tuple[dict, dict, dict]:
    source = yaml.safe_load((adapter_dir / "source.yml").read_text())
    schema = yaml.safe_load((adapter_dir / "schema.yml").read_text())
    pack = yaml.safe_load((adapter_dir.parents[1] / "pack.yml").read_text())
    return source, schema, pack


def check_outputs(adapter_dir: Path, output_dir: Path) -> list[str]:
    findings = []
    for name in ("records.parquet", "statements.parquet", "manifest.json"):
        if not (output_dir / name).exists():
            findings.append(f"missing {name}")
    if findings:
        return findings
    manifest = json.loads((output_dir / "manifest.json").read_text())
    validator = Draft202012Validator(json.loads((SCHEMAS / "manifest.schema.json").read_text()))
    findings += [f"manifest: {e.message}" for e in validator.iter_errors(manifest)]
    _, schema, _ = _load(adapter_dir)
    declared = [f["name"] for f in schema["fields"]]
    actual = pq.read_schema(output_dir / "records.parquet").names
    if declared != actual:
        findings.append(f"records columns {actual} differ from schema.yml {declared}")
    return findings


def check_provenance(adapter_dir: Path, output_dir: Path) -> list[str]:
    table = pq.read_table(output_dir / "statements.parquet")
    findings = []
    for column in ("source_ref", "asserted_at", "licence", "country"):
        nulls = table.column(column).null_count
        empty = sum(1 for v in table.column(column).to_pylist() if v == "")
        if nulls or empty:
            findings.append(f"{column}: {nulls} null, {empty} empty")
    precedence = table.column("precedence").to_pylist()
    bad = [p for p in precedence if p is None or not 1 <= p <= 5]
    if bad:
        findings.append(f"precedence out of range in {len(bad)} statements")
    return findings


def check_exclusions(adapter_dir: Path, output_dir: Path) -> list[str]:
    source, _, _ = _load(adapter_dir)
    excluded = set(source["pii"]["excluded_columns"]) | set(source["pii"]["hashed_columns"])
    findings = []
    for name in ("records.parquet", "statements.parquet"):
        leaked = excluded & set(pq.read_schema(output_dir / name).names)
        if leaked:
            findings.append(f"{name} carries excluded columns {sorted(leaked)}")
    fields = set(pq.read_table(output_dir / "statements.parquet").column("field").to_pylist())
    leaked_fields = {f for f in fields if any(col in f for col in excluded)}
    if leaked_fields:
        findings.append(f"statements map excluded columns to fields {sorted(leaked_fields)}")
    return findings


def check_identifiers(adapter_dir: Path, output_dir: Path) -> list[str]:
    source, _, pack = _load(adapter_dir)
    table = pq.read_table(output_dir / "statements.parquet")
    findings = []
    schemes = pack["identifier_schemes"]
    for field, value in zip(
        table.column("field").to_pylist(), table.column("value").to_pylist(), strict=True
    ):
        if field != "identifiers":
            continue
        ident = json.loads(value)
        scheme = ident.get("scheme")
        if scheme not in schemes:
            findings.append(f"unknown identifier scheme {scheme}")
        elif scheme not in source["identifier_schemes"]:
            findings.append(f"scheme {scheme} not declared in source.yml")
        elif not re.match(schemes[scheme]["pattern"], ident.get("value", "")):
            findings.append(f"{scheme} value {ident.get('value')!r} fails pattern")
    return sorted(set(findings))


def check_idempotent(adapter_dir: Path, output_dir: Path, compare_to: Path) -> list[str]:
    findings = []
    for name in ("records.parquet", "statements.parquet"):
        if (output_dir / name).read_bytes() != (compare_to / name).read_bytes():
            findings.append(f"{name} differs between runs on identical input")
    return findings


def check_tolerance(adapter_dir: Path, output_dir: Path) -> list[str]:
    manifest = json.loads((output_dir / "manifest.json").read_text())
    return [f"run flagged: {flag}" for flag in manifest.get("flags", [])]


def check_run(
    adapter_dir: Path,
    output_dir: Path,
    *,
    compare_to: Path | None = None,
    checks: list[str] | None = None,
) -> list[str]:
    adapter_dir, output_dir = Path(adapter_dir), Path(output_dir)
    selected = checks or list(ALL_CHECKS)
    findings: list[str] = []
    for check in selected:
        if check == "idempotent":
            if compare_to is None:
                continue
            findings += check_idempotent(adapter_dir, output_dir, Path(compare_to))
        else:
            findings += globals()[f"check_{check}"](adapter_dir, output_dir)
    return findings
