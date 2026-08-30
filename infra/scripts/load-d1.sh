#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: infra/scripts/load-d1.sh <regeneration_id>" >&2
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

databases=(atlas atlas-statements atlas-scores)
prefixes=("" statements- scores-)
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT

cd "$repo_root/app"
for index in "${!databases[@]}"; do
  database=${databases[$index]}
  prefix=${prefixes[$index]}
  for step in prelude stage swap; do
    sql_file="$regeneration_dir/${prefix}${step}.sql"
    if [[ ! -f $sql_file ]]; then
      echo "SQL file not found: $sql_file" >&2
      exit 1
    fi
    statements=$(awk '/;[[:space:]]*$/ { count++ } END { print count + 0 }' "$sql_file")
    started_at=$(date +%s)
    if pnpm exec wrangler d1 execute "$database" --remote -y --file "$sql_file" \
      >"$output_file" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi
    finished_at=$(date +%s)
    echo "$database ${prefix}${step}.sql statements=$statements exit=$exit_code seconds=$((finished_at - started_at))"
    if [[ $exit_code -ne 0 ]]; then
      sed -n '1,20p' "$output_file" >&2
      echo "ABORT after $database $step" >&2
      echo "DONE exit=$exit_code" >&2
      exit "$exit_code"
    fi
  done
done

for database in "${databases[@]}"; do
  if pnpm exec wrangler d1 info "$database" --json >"$output_file" 2>&1; then
    python3 -c \
      'import json, sys; data = json.load(sys.stdin); print(sys.argv[1], "size_MB", round(data.get("file_size", 0) / 1e6, 1))' \
      "$database" <"$output_file"
  else
    exit_code=$?
    sed -n '1,20p' "$output_file" >&2
    echo "failed to read database size: $database" >&2
    exit "$exit_code"
  fi
done

echo "DONE exit=0"
