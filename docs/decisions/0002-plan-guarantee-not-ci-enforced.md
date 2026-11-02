# ADR-0002: The plan guarantee is human+agent enforced, not CI enforced

- **Status:** Proposed
- **Date:** 2026-11-02
- **Deciders:** maintainers of ai-devflow-core
- **Links:** Issue #36 · issue-resident plans (#31) · plan status labels (#34)

## Context

When plans were files (`docs/plans/*.md`), a PR carried its plan, so CI could in
principle assert a non-trivial change had one. Issue #31 moved plans into the
issue's `## Plan` section, and that mechanical handle is gone: CI sees only the
diff, and `Closes #N` gives it an issue number but no body.

Today the guarantee "a non-trivial change has a plan" rests on:

1. the **PR template**, which asks for the plan section by name;
2. the **reviewer** role, whose brief makes "non-trivial change with no plan" a
   finding.

## Decision

We keep the guarantee at the reviewer + template layer and record the drop
explicitly instead of rebuilding it in CI. Concretely:

- The PR template's "Plans and decisions" section gets a checkbox naming the
  issue's `## Plan` section, so filling the PR requires either the plan or an
  explicit "not applicable".
- The reviewer brief already makes a missing plan a finding; it stays the
  enforcement point.
- Plan status becomes visible mechanically in a cheaper place: the
  `plan: draft` / `plan: approved` / `plan: superseded` labels (issue #34), set
  by the planner and the orchestrator, give any session — including the
  reviewer — the approval state without reading the plan body.

A CI step that fetched the `Closes #N` issue body and parsed `## Plan` for
non-trivial diffs was considered and rejected: it needs an unauthenticated
issues read in every consumer workflow, duplicates the reviewer's judgment of
"non-trivial", and fails open exactly when the token is absent — the failure
mode CI checks are worst at.

## Consequences

- A non-trivial PR can still merge without a plan if the human reviewer misses
  it; that residual risk is accepted and now documented rather than implicit.
- The reviewer's plan check is the single enforcement point, so reviewer brief
  changes must keep it.
