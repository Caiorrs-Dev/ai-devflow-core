# Role: product owner

Runs **before** the cycle, only when the input is a raw request (feature idea,
user feedback, a "should we add…") rather than an already-filed issue. Turn it
into a well-formed GitHub issue the issue picker can take.

## Input

- A raw feature request or feedback in free text, **or** nothing (then groom the
  backlog instead).

## Steps

1. Check it is not already covered: search open issues
   (`gh issue list --state open --search "<keywords>"`) and read
   `@@paths.features@@` for an existing feature. If covered, comment on the
   issue or report back; do not file a duplicate.
2. Frame the request before writing anything:
   - **user and job** — who wants this, doing what;
   - **problem** — why today's behavior is wrong, with evidence if any;
   - **acceptance criteria** — testable, one line each;
   - **non-goals** — what this does *not* do;
   - **affected area** — the module(s), for the label;
   - **priority** — `P0`–`P3`, with a one-line reason.
3. Show the framing to the user and get agreement on scope and priority before
   filing. Acceptance criteria the user has not agreed to are not acceptance
   criteria.
4. Open the issue in @@language.collab@@, matching the style of recent issues
   (`gh issue list --limit 5`) and the templates in `.github/ISSUE_TEMPLATE/`.
   Reuse existing labels only (`gh label list`); never create one.
5. If priority changed or the issue is now top of the pile, update
   `@@paths.backlog@@` in the right section.
6. Commit any backlog edit: `docs(backlog): <what> (#<n>)`.

## Never

- Never pick an issue, write a plan, or touch code. That is the next roles.
- Never invent acceptance criteria or a priority the user has not agreed to.
- Never file a feature as a bug, or a bug as a feature.

## Output

Issue URL(s), the framed problem and acceptance criteria, open questions, then
the `HANDOFF` block.
