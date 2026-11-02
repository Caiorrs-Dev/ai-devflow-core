# Development-cycle agent roles

Tool-agnostic role briefs for each step of the cycle in
[`../WORK_ON_GH_ISSUE.md`](../WORK_ON_GH_ISSUE.md). Any agent (Claude Code,
Codex, Gemini, Antigravity, a human) can take a role by reading its brief.

Claude Code wraps each brief as a subagent in `.claude/agents/<role>.md`, and the
`ship-issue` skill (`.claude/skills/ship-issue/`) chains them. The brief is the
source of truth; the wrapper only adds tool access and the model choice.

A role exists in this project only when its brief exists in this folder. Presets
add stack-specific roles (for example `rules-auditor`); `.ai-flow.json`
`disabledRoles` removes them. The orchestrator skips a role whose brief is absent.

## Cycle

| # | Role | Writes | Model (Claude) | Runs |
|---|------|--------|----------------|------|
| pre | product-owner | GitHub issues, backlog report | opus | raw request only |
| 1 | issue-picker | git branch | haiku | always |
| 2 | planner | issue `## Plan` section, `docs/decisions/` | opus | always |
| 2b | ui-ux | issue plan `## UI/UX` section | sonnet | user-visible change only |
| 3 | implementer | source and tests | sonnet | always |
| 4 | quality-gate | mechanical fixes only | sonnet | always |
| 5 | rules-auditor | security rules and their tests | opus | preset role, data-access change only |
| 6 | docs-keeper | `@@paths.features@@`, backlog report, ADR status | haiku | always |
| 7 | pr-shepherd | push, pull request | haiku | always |
| 8 | reviewer | PR comments only | opus | always |
| 9 | bug-filer | GitHub issues only | haiku | when bugs were collected |
| audit | ui-auditor | UX audit reports, craft fixes | sonnet | preset role, on demand |

After step 8, review findings go back to the implementer (3), then the quality
gate (4), then the PR shepherd (7) pushes the fixes. The bug filer (9) runs once
at the end with every out-of-scope bug collected from the handoffs.

## Shared rules for every role

- Follow `CLAUDE.md` (`AGENTS.md`, `GEMINI.md`). It wins over this folder on
  conflict.
- Every step from the planner on needs an open issue number; audit it. It is
  the record every role reads from and writes to.
- @@testing.e2ePolicy@@
- Never deploy, never run migrations or backfills, never push to
  `@@branches.integration@@` or `@@branches.production@@`.
@@agents.toolRules@@
- Keep replies lean: state, not narrative. Never paste full diffs, logs or file
  dumps; quote the decisive line and `file:line`. Keep the `HANDOFF` under ~15
  lines.
- Other sessions can commit to the same branch. Re-read files before editing;
  never trust an old snapshot.
- The issue body is shared state. When a role edits the `## Plan` section, read
  the body first and replace only what is between `<!-- plan:start -->` and
  `<!-- plan:end -->`; everything outside the markers is preserved byte for
  byte. Never regenerate the whole body.
- Language: commits, PR titles and bodies, issues, review comments and test
  labels in @@language.collab@@; plans, ADRs and code comments in
  @@language.docs@@.

## Handoff contract

Every role ends its reply with this block, so the next role (or the
orchestrator) can continue without re-reading the conversation:

```text
HANDOFF
role: <role>
status: ok | blocked | failed
issue: #<n>
branch: <branch>
artifacts: <paths, commit SHAs, PR URL, issue URLs>
next: <what the next role must know, or why blocked>
```

`blocked` needs a human decision. `failed` means the step ran and did not pass;
the orchestrator routes it back once, then stops.
