#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: infra/scripts/upload-regen.sh <regeneration_id>" >&2
  exit 2
fi

regeneration_id=$1
if [[ ! $regeneration_id =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "invalid regeneration id: $regeneration_id" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
regeneration_dir="$repo_root/data/regen/$regeneration_id"
if [[ ! -d $regeneration_dir ]]; then
  echo "regeneration directory not found: data/regen/$regeneration_id" >&2
  exit 1
fi

sql_files=(
  prelude.sql
  stage.sql
  swap.sql
  statements-prelude.sql
  statements-stage.sql
  statements-swap.sql
  scores-prelude.sql
  scores-stage.sql
  scores-swap.sql
)
for sql_file in "${sql_files[@]}"; do
  if [[ ! -f $regeneration_dir/$sql_file ]]; then
    echo "SQL file not found: data/regen/$regeneration_id/$sql_file" >&2
    exit 1
  fi
done

temp_dir=$(mktemp -d)
output_file="$temp_dir/wrangler.out"
index_file="$temp_dir/index.json"
next_index_file="$temp_dir/next-index.json"
retired_file="$temp_dir/retired.txt"
trap 'rm -rf "$temp_dir"' EXIT

cd "$repo_root/app"
for sql_file in "${sql_files[@]}"; do
  started_at=$(date +%s)
  if pnpm exec wrangler r2 object put \
    "atlas-data/regen/$regeneration_id/$sql_file" \
    --file "$regeneration_dir/$sql_file" \
    --content-type 'application/sql; charset=utf-8' \
    --remote >"$output_file" 2>&1; then
    exit_code=0
  else
    exit_code=$?
  fi
  bytes=$(wc -c <"$regeneration_dir/$sql_file" | tr -d '[:space:]')
  echo "$sql_file bytes=$bytes exit=$exit_code seconds=$(( $(date +%s) - started_at ))"
  if [[ $exit_code -ne 0 ]]; then
    sed -n '1,20p' "$output_file" >&2
    echo "SQL upload failed: $sql_file" >&2
    exit "$exit_code"
  fi
done

if pnpm exec wrangler r2 object get "atlas-data/regen/index.json" \
  --file "$index_file" --remote >"$output_file" 2>&1; then
  :
else
  exit_code=$?
  if grep -Eiq 'not found|does not exist|NoSuchKey|404' "$output_file"; then
    printf '{"regenerations":[]}\n' >"$index_file"
  else
    sed -n '1,20p' "$output_file" >&2
    echo "failed to read regen/index.json" >&2
    exit "$exit_code"
  fi
fi

described_file="$temp_dir/described.json"
"$repo_root/pipeline/.venv/bin/python" -m atlas_pipeline regen describe --dir "$regeneration_dir" >"$described_file"
python3 - "$index_file" "$regeneration_id" "$next_index_file" "$retired_file" "$described_file" <<'PY'
import datetime
import json
import pathlib
import re
import sys

source, current, destination, retired, described_path = sys.argv[1:]
payload = json.loads(pathlib.Path(source).read_text())
ids = payload.get("regenerations")
if not isinstance(ids, list) or not all(
    isinstance(value, str) and re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", value)
    for value in ids
):
    raise ValueError("invalid regen/index.json")
ordered = sorted(set(ids) | {current}, reverse=True)
kept = ordered[:3]
files = payload.get("files") if isinstance(payload.get("files"), dict) else {}
files = {key: value for key, value in files.items() if key in kept}
files[current] = json.loads(pathlib.Path(described_path).read_text())
pathlib.Path(destination).write_text(
    json.dumps(
        {
            "regenerations": kept,
            "files": files,
            "updated_at": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        indent=2,
    )
    + "\n"
)
pathlib.Path(retired).write_text("".join(f"{value}\n" for value in ordered[3:]))
PY

while IFS= read -r retired_id; do
  [[ -n $retired_id ]] || continue
  for sql_file in "${sql_files[@]}"; do
    if pnpm exec wrangler r2 object delete \
      "atlas-data/regen/$retired_id/$sql_file" --remote --force \
      >"$output_file" 2>&1; then
      echo "deleted regen/$retired_id/$sql_file"
    else
      exit_code=$?
      if grep -Eiq 'not found|does not exist|NoSuchKey|404' "$output_file"; then
        echo "already absent regen/$retired_id/$sql_file"
      else
        sed -n '1,20p' "$output_file" >&2
        echo "failed to delete regen/$retired_id/$sql_file" >&2
        exit "$exit_code"
      fi
    fi
  done
done <"$retired_file"

if pnpm exec wrangler r2 object put "atlas-data/regen/index.json" \
  --file "$next_index_file" --content-type application/json --remote \
  >"$output_file" 2>&1; then
  echo "regen/index.json -> $regeneration_id"
else
  exit_code=$?
  sed -n '1,20p' "$output_file" >&2
  echo "regen/index.json upload failed" >&2
  exit "$exit_code"
fi

echo "DONE exit=0"
