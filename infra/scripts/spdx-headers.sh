#!/bin/sh
# SPDX-License-Identifier: Apache-2.0

set -eu

check_only=0
if [ "${1:-}" = "--check" ]; then
	check_only=1
	shift
fi

if [ "$#" -ne 0 ]; then
	printf 'usage: %s [--check]\n' "$0" >&2
	exit 2
fi

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

scope_file=$(mktemp "${TMPDIR:-/tmp}/trustscore-atlas-spdx-scope.XXXXXX")
content_file=$(mktemp "${TMPDIR:-/tmp}/trustscore-atlas-spdx-content.XXXXXX")
trap 'rm -f "$scope_file" "$content_file"' EXIT HUP INT TERM

git ls-files -- '*.ts' '*.svelte' '*.py' '*.yml' '*.yaml' '*.sh' '*.sql' |
	grep -v -e 'app/static/' -e '.svelte-kit/' -e '.wrangler/' >"$scope_file"

missing=0
while IFS= read -r file; do
	if head -n 3 "$file" | grep -q 'SPDX-License-Identifier'; then
		continue
	fi

	case "$file" in
		*.ts | *.svelte) header='// SPDX-License-Identifier: Apache-2.0' ;;
		*.py | *.yml | *.yaml | *.sh) header='# SPDX-License-Identifier: Apache-2.0' ;;
		*.sql) header='-- SPDX-License-Identifier: Apache-2.0' ;;
	esac

	if [ "$check_only" -eq 1 ]; then
		printf '%s\n' "$file"
		missing=1
		continue
	fi

	first_line=$(sed -n '1p' "$file")
	case "$file:$first_line" in
		*.svelte:'<script'*)
			{
				printf '%s\n' "$first_line"
				printf '\t%s\n' "$header"
				tail -n +2 "$file"
			} >"$content_file"
			;;
		*.svelte:*)
			printf 'cannot place SPDX header safely in %s: opening script block is not first\n' "$file" >&2
			exit 3
			;;
		*:'#!'*)
			{
				printf '%s\n' "$first_line"
				printf '%s\n' "$header"
				tail -n +2 "$file"
			} >"$content_file"
			;;
		*)
			{
				printf '%s\n' "$header"
				cat "$file"
			} >"$content_file"
			;;
	esac

	cat "$content_file" >"$file"
	printf '%s\n' "$file"
done <"$scope_file"

exit "$missing"
