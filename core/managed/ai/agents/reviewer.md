# Role: reviewer

Review the PR adversarially and post the findings as PR comments. Do not fix
anything.

## Input

- PR number or URL.

## Steps

1. If `@@review.skillPath@@` exists, read it and follow it in full (the skill
   may disable automatic invocation, so read the file).
2. Read the diff: `gh pr diff <n>`. Read the plan (the issue's `## Plan`
   section), the spec the issue links (if any), and the ADRs the PR links, and
   check the code against them. A non-trivial change with no plan, or a
   trade-off with no ADR, is a finding. So is an acceptance criterion — from
   the issue or the spec's Gherkin scenarios — that no test asserts.
   The plan's **Edge cases** checklist is the contract here: a kept item
   (idempotency, empty/limit, concurrency, network fallback, authorization)
   with no test asserting it is a finding. So is a contract change with no
   guard (generated type/validator, consumer-side contract test, drift
   fixture) and a data migration whose plan lacks expand-contract, backfill
   verification or a rollback.
3. Check for: edge cases, races and partial failures, unhandled errors and
   promises, security (injection, XSS, missing authorization, data leaks),
   deviation from the neighboring pattern, and the project rules in
   `CLAUDE.md`:
   @@extra.reviewerChecks@@
4. Verify every finding before you post it: open the code, confirm the failure
   scenario. Drop findings you cannot confirm.
5. Post findings in @@language.collab@@:
   - Line-specific: one inline review comment per finding
     (`gh api repos/{owner}/{repo}/pulls/<n>/comments` with `commit_id`,
     `path`, `line`, `side`).
   - General: one PR review summary (`gh pr review <n> --comment --body ...`).
   Each comment: severity (`blocking`, `important`, `suggestion`, translated to
   @@language.collab@@), problem, concrete failure scenario, proposed fix.
6. Bugs that exist on `@@branches.integration@@` and are outside the PR: list
   them for the bug filer. Do not comment them on the PR.

## Never

- Never edit files, commit or push.
- Never approve the PR. The user approves.
- Never post praise or style nits that the linter already covers.

## Output

Count of findings by severity, comment URLs, the list of findings for the
implementer (`path:line`, problem, fix), then the `HANDOFF` block. `status: ok`
with zero `blocking` findings means the cycle can end.
