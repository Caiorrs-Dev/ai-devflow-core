# ADR-0001: Adopt the EGM review idea in reduced form (two personas, after the native role)

- **Status:** Proposed
- **Date:** 2026-11-02
- **Deciders:** maintainers of ai-devflow-core
- **Links:** Closes #21 · egm mixin PR #55 · experiments in `lucky-pet-app` (#954 code, #962 spec)

## Context

The cycle has `planner` (designs) and `reviewer` (reviews the PR). Both read the
conversation that produced the change, so they inherit its assumptions. The
Elephant-Goldfish Model attacks exactly that bias: stateless subagents read only
the artifact and try to break it.

Before adopting a plugin that spawns six subagents, we measured it. Two runs, same
host and model for the control and for the swarm:

| Artifact | Native role | Findings | Real | Precision | Material the native missed |
|---|---|---|---|---|---|
| Code — PR #954 (321 lines) | `reviewer` | 4 | 4 | **75%** | — |
| Code — six Goldfish | 11 (7 unique) | 5 | 71% | 2 |
| Spec — issue #962 (57 lines) | `planner` | 4 | 4 | **100%** | — |
| Spec — six Goldfish | 15 (8 unique) | 11 | ~73% | 2 |

Three results repeated across both runs and drive the decision:

1. **The native role found the blocking issue in both runs; the swarm found none.**
   The swarm is good at a different thing — both of its unique material findings were
   about *state* (a `getDoc`→`setDoc` race between two devices; a permission snapshot
   that goes stale after login), not about reading code line by line.
2. **The swarm's precision sat just under the 30% false-positive bar, but for the wrong
   reason: redundancy.** It reported the same type mismatch three times in the spec run,
   and asserted that `DeviceInfo` getters are synchronous when they return promises.
   Six runs for two findings does not clear "acceptable cost".
3. **`zoom_out` and `structural` produced nothing material in either run** — four of the
   six personas were dead weight on artifacts under 300 lines.

If nothing changes, every project keeps reviewing with the conversation's bias, and the
one class of defect it reliably misses — cross-device state and stale snapshots — keeps
shipping.

## Decision

Adopt the idea, not the default configuration: run **two** stateless personas,
`design_critic` (state and semantics) and `codebase_details` (verification against the
repo), **after** the native `planner`/`reviewer`, never in place of it. Skip
`zoom_out` and `structural` on artifacts smaller than ~300 lines or a single issue.

## Alternatives considered

- **Adopt all six personas as shipped** — rejected: zero blocking findings in both runs,
  ~27% false positives concentrated in repeated assertions, and four personas with no
  material output on small artifacts. The cost is six runs for two findings.
- **Discard the EGM entirely** — rejected: in both runs the swarm produced two material
  findings the native role missed, and both were in a class the native does not cover
  (state races, stale snapshots). That is a real gap, not a cosmetic one.
- **Replace the native reviewer with the swarm** — rejected: the native role caught the
  only blocking issue in both runs. Replacing it would lose the blocking coverage to gain
  the state coverage.
- **Keep six personas but only on large PRs** — plausible, but nothing in either run
  justifies the other four; they would need their own evidence first.

## Consequences / trade-offs

- **Positive:** the two-persona pass costs two extra runs per artifact and closes the
  state/snapshot gap the native role leaves. The precision bar (<30% false positive) is
  met without paying for redundant personas.
- **Negative / accepted cost:** two more model calls per review, and the personas must be
  told to read the repository — without that instruction the swarm asserted an API was
  synchronous when it is not, and claimed a file did not exist when it did.
- **Negative / accepted cost:** the personas' briefs are a port of the upstream
  `agents/*.md`; they drift when the plugin is bumped. Re-read the upstream personas at
  each bump instead of adding a CI diff check for now.
- **Follow-up:** revisit when a PR larger than ~300 lines arrives — that is the only case
  where the wider swarm might earn its cost. If the plugin later becomes host-neutral,
  the port can be replaced by the upstream skills.
