## Development cycle

- To work on a GitHub issue, follow `ai/WORK_ON_GH_ISSUE.md`. Each step has a
  role brief in `ai/agents/`; in Claude Code run the whole cycle with the
  `ship-issue` skill.
- Plan before code. Every non-trivial change gets a plan in `docs/plans/`
  (template `_template.md`) before coding. Every decision with a trade-off gets
  an ADR in `docs/decisions/`, numbered with
  `scripts/ai/next-adr-number.sh` and indexed with `scripts/ai/adr-index.sh`. Supersede an ADR; never delete it. Link the
  plan and ADR from the PR.
- Apply the code-quality bar at design time, not only in review: abstraction
  boundaries, condition growth, duplication, the simplest structure that works.
- Branch from `@@branches.integration@@` as `<type>/issue-<n>`. PRs target
  `@@branches.integration@@` and are squash-merged; `@@branches.production@@`
  receives only promotion PRs, merged with a merge commit. Never push to either
  directly.
- Conventional Commits (`feat`, `fix`, `perf`, `docs`, `ci`, `test`,
  `refactor`, `chore`, `style`, `build`, `revert`). Small working commits. The
  PR title is a conventional commit too: squash merges make it the commit
  release-please reads.
- Language: commits, PRs, issues, review comments and test labels in
  @@language.collab@@; plans, ADRs and code comments in @@language.docs@@.
- Add or update unit tests for every code change. @@testing.e2ePolicy@@
- Bugs outside the current task become new GitHub issues, not fixes in this
  branch.

## Tools and token economy

@@agents.toolRules@@
- Prefer quiet commands that print only errors; never start watch modes.
- Load the project's and the user's skills before writing code in their area.
