# Plans

One file per non-trivial feature or refactor, written before the code, so the
intended approach and its risks are on record. A plan is a thinking tool, not a
contract: it can change as the work reveals reality.

> Companion folder: [`../decisions/`](../decisions/README.md) for ADRs.

## When to write a plan

Any change that spans more than one or two files, adds a flow, screen or module,
changes a data model or API contract, adds a dependency, or needs an approach
agreed before coding. Skip it for small fixes; the planner then returns
`plan: not needed`.

## Naming and format

- File: `YYYY-MM-DD-short-title.md`.
- Copy [`_template.md`](./_template.md): objective, scope, steps (one commit
  each, with its test), risks, decisions.
- **Status:** `Draft`, `In progress`, `Done` or `Abandoned`.
