# Working on a GitHub issue

Each step below has a role brief in [`agents/`](./agents/README.md). In Claude
Code, run the whole cycle with the `ship-issue` skill (`/ship-issue <n>`), or
call one role as a subagent. In a tool without subagents, take each role in
order by reading its brief.

1. **Pick** (`issue-picker`): the issue the user named, or the top of
   `@@paths.backlog@@`. Check no open PR already closes it. Branch
   `<type>/issue-<n>` from `@@branches.integration@@`.
2. **Plan** (`planner`, then `ui-ux` for user-visible changes): a plan written
   into the issue's `## Plan` section and an ADR in `docs/decisions/` for each
   trade-off. The user approves the plan before any code.
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

Every run needs an open issue. When the input has no issue number, the input
decides who files it: a feature-sized request goes to `spec-writer` (a `Spec:`
issue with use cases, Gherkin acceptance criteria and a success metric); any
other raw request goes to `product-owner` (framed issue); a concrete task is
filed by `issue-picker` as a minimal issue. Never start implementation without
an issue number.

## When production breaks

Impact contained first, analysis second. When a shipped change causes a
production incident, run the `postmortem-writer` role after mitigation: it
writes a blameless postmortem to `docs/postmortems/`, files every action item
as an owned GitHub issue (they re-enter this cycle normally), and adds a
runbook to `docs/runbooks/` when one would have shortened the incident.

## Promoting to `@@branches.production@@`

Promotion is a human decision, outside the issue cycle:

1. Open a PR from `@@branches.integration@@` to `@@branches.production@@` with a
   conventional title, for example `chore(release): promote to production`.
2. Merge it with a **merge commit**, not a squash: release-please reads every
   conventional commit that reaches `@@branches.production@@`, and a squash
   would hide them behind one title.
3. release-please opens or updates its release PR on `@@branches.production@@`.
   Merging that PR tags the version; the back-merge workflow then brings the
   version bump back into `@@branches.integration@@`.

@@testing.e2ePolicy@@
