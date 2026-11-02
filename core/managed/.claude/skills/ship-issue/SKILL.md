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
2. **planner** — writes the plan into the issue's `## Plan` section (and posts
   a summary comment); then show the user that plan and the open questions, and
   wait for approval. Skip the wait only with `--no-plan-gate` or when the
   planner returns `plan: not needed`. On approval, put `plan: approved` on the
   issue (create the label first if it does not exist) and remove
   `plan: draft`; that label is what tells every other session the plan is
   frozen. When the planner wrote an ADR, ask the
   **pr-shepherd** for an early push of the branch so parallel planners see the
   ADR number.
3. **ui-ux** — only when the change has a user-visible surface; skip otherwise.
   It appends a `## UI/UX` section to the approved plan for the implementer.
3b. **threat-modeler** — only when the plan touches authentication, payments,
   PII, admin surfaces or keys; skip otherwise. It appends a `## Threat
   model` section (STRIDE per component) to the issue's plan, with the
   mitigations as plan steps or filed issues.
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

**Issue gate:** every run needs an open issue. When the input has no issue
number:
- a **feature-sized request** (new flow, new module, anything with a design
  space) goes to **spec-writer** first: a feasibility pass and a `Spec:` issue
  with use cases, edge cases, Gherkin acceptance criteria and a success metric;
- any other **raw request** (feedback, a small "should we add…") goes to
  **product-owner**, which frames and files it;
- a **concrete task** (a specific fix or change the user already described) is
  filed by **issue-picker** as a minimal issue — one-line title, a few lines of
  what/why/verify — with no product-owner framing.

Never start implementation without an issue number — it is the record every
role anchors to.

Run roles one at a time: they commit to the same branch, and parallel commits
collide on the git index.

## Verify done-claims before passing them on

A `HANDOFF` block is a self-report. Before acting on any claim, read the
artifact it names — "PR opened" → `gh pr view <n>`; "plan written" → the
issue's `## Plan` section exists and is non-empty; "tests pass" → the output
with counts, not "all good"; "committed" → `git log` on the branch. A claim
you cannot verify goes back to the role that made it; never forward a
verification you did not run.

## Human gates

Three gates the cycle never crosses by itself, at any step:

1. **Plan approval** — implementation starts only after the user approves
   (or `--no-plan-gate`).
2. **PR approval** — the reviewer never approves; the user does.
3. **Merge** — the pr-shepherd never merges; the user does.

## Cost discipline

Each role runs on the model its wrapper assigns — do not upgrade a role's
model mid-run because a step feels hard; report the difficulty instead. When
the tool exposes token usage per subagent, include the per-role totals in the
final report so the user sees what the run cost.

## Final report to the user

PR URL, commits, tests run, review rounds and findings left open, issues filed,
`HUMAN AUDIT REQUIRED` items, and deploy steps the merge needs (functions,
backfills, migrations). Add the post-merge loop from the plan: the rollout
stage to flip next (and who flips it), and the production evidence to verify —
which metric or alert, where it is read, what value means success, and when to
check. Restate the E2E policy: @@testing.e2ePolicy@@
