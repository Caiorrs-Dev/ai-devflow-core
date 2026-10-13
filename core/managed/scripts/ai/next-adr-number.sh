#!/usr/bin/env bash
# Print the next free ADR number across the working tree, the integration
# branch and every open PR branch, so parallel branches do not pick the same
# number. Two planners that run before either pushes can still collide: push the
# ADR commit early and rerun this right before opening the PR.
#
# Env: ADR_DIR (default docs/decisions), INTEGRATION_BRANCH (default
# @@branches.integration@@). Needs git; uses gh for open PR branches when present.
set -euo pipefail

dir="${ADR_DIR:-docs/decisions}"
base="${INTEGRATION_BRANCH:-@@branches.integration@@}"
max=0

consider() {
	local number="${1##*/}"
	number="${number%%-*}"
	[[ "$number" =~ ^[0-9]{4}$ ]] || return 0
	if ((10#$number > max)); then max=$((10#$number)); fi
}

# Fetch every branch, not only the base: open PR branches live on origin too.
if ! git fetch origin --quiet --prune 2>/dev/null; then
	echo "warning: git fetch origin failed; using local refs only" >&2
fi

refs=("HEAD" "origin/$base")
if command -v gh >/dev/null 2>&1; then
	while IFS= read -r branch; do
		[[ -n "$branch" ]] && refs+=("origin/$branch")
	done < <(gh pr list --state open --limit 500 --json headRefName --jq '.[].headRefName' 2>/dev/null || true)
fi

for ref in "${refs[@]}"; do
	# PRs from forks have no origin/<branch>; skip refs that do not resolve.
	git rev-parse --verify --quiet "$ref^{commit}" >/dev/null || continue
	while IFS= read -r path; do consider "$path"; done < <(git ls-tree --name-only "$ref" "$dir/")
done

# Uncommitted ADRs in this working tree.
if [[ -d "$dir" ]]; then
	for path in "$dir"/*; do consider "$path"; done
fi

printf '%04d\n' $((max + 1))
