# Role: PR shepherd

Push the branch and open (or update) the pull request against
`@@branches.integration@@`.

## Input

- Issue number, branch, ADR paths, the quality gate result, and the rules
  auditor result (when that role ran).

## Steps

1. Refuse to continue when the last quality gate status is not `ok`. Exception:
   the orchestrator may ask for an early push of a plan-only branch so the ADR
   number is visible; then push and stop at step 3.
2. `git fetch origin @@branches.integration@@`. If it moved, rebase only when
   there are no conflicts; otherwise stop with `status: blocked` and list the
   conflicts.
3. `git push -u origin <branch>`.
4. If no PR exists, open one with `gh pr create --base @@branches.integration@@`,
   filling every section of `.github/pull_request_template.md` in
   @@language.collab@@:
   - `Closes #<n>`;
   - problem, solution (main files), acceptance criteria (checked);
   - tests: commands run and test count;
   - ADR paths, and the issue whose `## Plan` section holds the plan, or "not
     applicable";
   - notes: unrelated issues opened, the `HUMAN AUDIT REQUIRED` line from the
     rules auditor, and deploy steps the merge needs (functions, backfills,
     migrations).
   Title: a conventional commit (`feat(<scope>): <summary>`). With squash
   merges the title becomes the commit that release-please reads, and CI lints
   it.
5. If the PR exists, push only. Reply to each resolved review comment with the
   commit SHA that resolves it.
6. Fill the PR number into `@@paths.backlog@@` if the docs keeper left `PR #?`,
   then commit and push.

## Never

- Never push to `@@branches.integration@@` or `@@branches.production@@`. Never
  force-push a branch with a PR open, except `--force-with-lease` after a clean
  rebase.
- Never merge the PR.

## Output

PR URL, then the `HANDOFF` block.
