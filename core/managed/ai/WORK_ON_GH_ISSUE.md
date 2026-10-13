# Working on a GitHub issue

Each step below has a role brief in [`agents/`](./agents/README.md). In Claude
Code, run the whole cycle with the `ship-issue` skill (`/ship-issue <n>`), or
call one role as a subagent. In a tool without subagents, take each role in
order by reading its brief.

1. **Pick** (`issue-picker`): the issue the user named, or the top of
   `@@paths.backlog@@`. Check no open PR already closes it. Branch
   `<type>/issue-<n>` from `@@branches.integration@@`.
2. **Plan** (`planner`, then `ui-ux` for user-visible changes): a plan in
   `docs/plans/` and an ADR in `docs/decisions/` for each trade-off.
   The user approves the plan before any code.
3. **Implement** (`implementer`): test-first, small conventional commits.
4. **Gate** (`quality-gate`): lint, format, typecheck, unit tests, build, dead
   code. Only mechanical fixes here.
5. **Audit** (`rules-auditor`, when the preset has it): security rules for any
   data-access change.
6. **Document** (`docs-keeper`): features log, backlog report, plan and ADR
   status.
7. **Open the PR** (`pr-shepherd`) against `@@branches.integration@@`.
8. **Review** (`reviewer`): verified findings as PR comments; the implementer
   resolves them, at most 2 rounds.
9. **File unrelated bugs** (`bug-filer`) as separate issues. Never fix them in
   this branch.

Before step 1, run `product-owner` only when the input is a raw request rather
than a filed issue.

@@testing.e2ePolicy@@
