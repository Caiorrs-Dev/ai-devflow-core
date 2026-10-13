---
name: ship-issue
description: Run the full GitHub issue cycle for this repo — pick issue, branch, plan/ADR, implement, quality gate, rules audit, docs, PR, review, fix review comments, file unrelated bugs — by chaining the role agents in ai/agents/. Use when the user says "work on issue #N", "ship issue", "/ship-issue", or "pick the next issue".
argument-hint: "[issue number] [--no-plan-gate]"
---

# Ship issue

Orchestrate the cycle from `ai/WORK_ON_GH_ISSUE.md`. Run this skill in the
**main thread**: subagents cannot start other subagents, so the main thread
calls each role in order and passes the `HANDOFF` block of one role to the next.

Role briefs: `ai/agents/<role>.md`. Claude Code subagents: `.claude/agents/<role>.md`.
In a tool without subagents, take each role yourself by reading its brief.
**Skip any role whose brief does not exist**: the preset or `.ai-flow.json`
left it out of this project.

## Sequence

Pass every role: issue number, branch, working directory, plan path, and the
previous `HANDOFF` block. Stop and report to the user on any `status: blocked`
or a second `status: failed` from the same step.

1. **issue-picker** — argument: the issue number, if given.
2. **planner** — then show the user the plan summary and open questions, and
   wait for approval. Skip the wait only with `--no-plan-gate` or when the
   planner returns `plan: not needed`. When the planner wrote an ADR, ask the
   **pr-shepherd** for an early push of the branch so parallel planners see the
   ADR number.
3. **ui-ux** — only when the change has a user-visible surface; skip otherwise.
   It appends a `## UI/UX` section to the approved plan for the implementer.
4. **implementer** — with the approved plan.
5. **quality-gate** — on `failed`, send its error to the implementer, then run
   the gate again. Two failures in a row: stop and ask the user.
6. **rules-auditor** — when its brief exists. It returns `rules: not needed`
   when the diff touches no data access.
7. **docs-keeper**
8. **pr-shepherd** — opens the PR.
9. **reviewer** — on the PR.
10. Review loop, at most 2 rounds: when the reviewer reports `blocking` or
    `important` findings, implementer (resolve comments) → quality-gate →
    pr-shepherd (push + reply) → reviewer again. After round 2, list what is
    left for the user.
11. **bug-filer** — once, at the end, with every unrelated bug collected from
    all handoffs. Skip when the list is empty.

Run **product-owner** before step 1 only when the input is a raw request rather
than a filed issue; with an issue number, start at step 1.

Run roles one at a time: they commit to the same branch, and parallel commits
collide on the git index.

## Final report to the user

PR URL, commits, tests run, review rounds and findings left open, issues filed,
`HUMAN AUDIT REQUIRED` items, and deploy steps the merge needs (functions,
backfills, migrations). Restate the E2E policy: @@testing.e2ePolicy@@
