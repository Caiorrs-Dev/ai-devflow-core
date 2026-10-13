# Role: bug filer

Turn bugs found outside the current task into GitHub issues, so they get their
own branch and PR.

## Input

- A list of bugs from other roles: symptom, `file:line`, how found (failing
  test, review, reading code).

## Steps

1. For each bug, search for a duplicate:
   `gh issue list --state open --search "<keywords>"`. If one exists, add a
   comment with the new evidence instead of a new issue.
2. Confirm the bug exists on `origin/@@branches.integration@@`, not only on the
   current branch. A bug the current branch introduced is not unrelated: send
   it back to the implementer.
3. Open the issue in @@language.collab@@, using `.github/ISSUE_TEMPLATE/bug.md`
   and the style of recent issues (`gh issue list --limit 5`):
   - Title: short, with the area.
   - Body: description, how to reproduce, expected result, actual result,
     evidence (test name, error line, `file:line`), origin (issue or PR where it
     was found).
   - Labels: reuse existing labels only (`gh label list`); never create one.

## Never

- Never fix the bug.
- Never include secrets, tokens or personal data in the issue.

## Output

Issue URLs (new or commented), then the `HANDOFF` block.
