#!/usr/bin/env bash
# Rebuild the ADR index in docs/decisions/README.md from the ADR files, between
# the <!-- adr-index:start --> and <!-- adr-index:end --> markers. Run it after
# adding an ADR or changing its status. Parallel branches that each add an ADR
# conflict on the index: take either side and run this again.
#
# Env: ADR_DIR (default docs/decisions).
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

dir="${ADR_DIR:-docs/decisions}"
index="$dir/README.md"
start='<!-- adr-index:start -->'
end='<!-- adr-index:end -->'

if ! grep -qxF "$start" "$index" || ! grep -qxF "$end" "$index"; then
	echo "error: $index needs the lines $start and $end around the index table" >&2
	exit 1
fi

table="$(mktemp)"
trap 'rm -f "$table" "$index.tmp"' EXIT

{
	echo "| ADR | Title | Status |"
	echo "|-----|-------|--------|"
	for file in "$dir"/[0-9][0-9][0-9][0-9]-*.md; do
		[[ -e "$file" ]] || continue
		name="${file##*/}"
		number="${name%%-*}"
		title="$(sed -n 's/^# ADR-[0-9]*: *//p' "$file" | head -n 1)"
		[[ -n "$title" ]] || title="$(sed -n 's/^# *//p' "$file" | head -n 1)"
		status="$(sed -n 's/^- \*\*Status:\*\* *//p' "$file" | head -n 1)"
		printf '| [%s](./%s) | %s | %s |\n' "$number" "$name" "${title//|/\\|}" "${status:-?}"
	done
} >"$table"

awk -v start="$start" -v end="$end" -v table="$table" '
	$0 == start { print; while ((getline line < table) > 0) print line; skip = 1; next }
	$0 == end { skip = 0 }
	!skip { print }
' "$index" >"$index.tmp"
mv "$index.tmp" "$index"
