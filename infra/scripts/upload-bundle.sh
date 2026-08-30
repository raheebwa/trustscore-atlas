#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: infra/scripts/upload-bundle.sh <regeneration_id>" >&2
  exit 2
fi

regeneration_id=$1
if [[ ! $regeneration_id =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "invalid regeneration id: $regeneration_id" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
bundle_dir="$repo_root/data/bundles/$regeneration_id"
if [[ ! -d $bundle_dir ]]; then
  echo "bundle directory not found: data/bundles/$regeneration_id" >&2
  exit 1
fi
if [[ ! -f $bundle_dir/manifest.json ]]; then
  echo "bundle manifest not found: data/bundles/$regeneration_id/manifest.json" >&2
  exit 1
fi

latest_file=$(mktemp)
output_file=$(mktemp)
trap 'rm -f "$latest_file" "$output_file"' EXIT
failures=0

cd "$repo_root/app"
while IFS= read -r relative_path; do
  relative_path=${relative_path#./}
  case $relative_path in
    *.parquet) content_type=application/vnd.apache.parquet ;;
    *.csv) content_type='text/csv; charset=utf-8' ;;
    *.json) content_type=application/json ;;
    *.jsonl) content_type=application/x-ndjson ;;
    *.md) content_type='text/markdown; charset=utf-8' ;;
    *) content_type=text/plain ;;
  esac
  started_at=$(date +%s)
  if pnpm exec wrangler r2 object put \
    "atlas-data/bundles/$regeneration_id/$relative_path" \
    --file "$bundle_dir/$relative_path" \
    --content-type "$content_type" \
    --remote >"$output_file" 2>&1; then
    exit_code=0
  else
    exit_code=$?
    failures=$((failures + 1))
  fi
  bytes=$(wc -c <"$bundle_dir/$relative_path" | tr -d '[:space:]')
  echo "$relative_path bytes=$bytes exit=$exit_code seconds=$(( $(date +%s) - started_at ))"
  if [[ $exit_code -ne 0 ]]; then
    sed -n '1,20p' "$output_file" >&2
  fi
done < <(cd "$bundle_dir" && find . -type f -print | LC_ALL=C sort)

if [[ $failures -ne 0 ]]; then
  echo "DONE failures=$failures" >&2
  exit 1
fi

printf '{"regeneration_id":"%s","uploaded_at":"%s"}\n' \
  "$regeneration_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$latest_file"
if pnpm exec wrangler r2 object put "atlas-data/bundles/latest.json" \
  --file "$latest_file" --content-type application/json --remote \
  >"$output_file" 2>&1; then
  echo "latest.json -> $regeneration_id"
else
  exit_code=$?
  sed -n '1,20p' "$output_file" >&2
  echo "latest.json upload failed" >&2
  exit "$exit_code"
fi

echo "DONE failures=0"
