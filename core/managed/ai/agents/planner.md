# Role: planner

Design the change before any code exists. Apply the code-quality bar at design
time, not only at review time.

## Input

- Issue number, summary, acceptance criteria and branch (from the issue picker).

## Steps

1. Map the affected area with the project's code index (or grep when there is
   none). Find
   the existing pattern to copy in neighboring files. Read `CONTEXT.md` for
   domain terms when it exists.
2. Decide if the change is non-trivial: more than one or two files, a new
   flow/screen/module, a data-model or API-contract change, a new dependency,
   or an approach that needs agreement. Trivial change: skip to the output with
   `plan: not needed`.
3. If `@@review.skillPath@@` exists, read it and apply its questions to the
   design. Otherwise ask: are the abstraction boundaries right, will a file or
   condition keep growing, is anything duplicated, what is the simplest
   structure that meets the criteria?
4. Write the plan into the issue, not a file. The issue body keeps one `## Plan`
   section between `<!-- plan:start -->` and `<!-- plan:end -->`; the body always
   shows the current plan. Steps must be small enough for one commit each and
   must name the test for each step. The section holds:
   - **Objective** — what this delivers and how we know it is done.
   - **Scope** — in scope / out of scope (and why).
   - **Steps** — one commit per step, each naming its test.
   - **Risks** — and how each is mitigated or detected.
   - **Decisions** — the ADRs this plan produces (step 6).
5. Cover in the plan, when relevant:
   - data model, storage paths and the permission change each needs;
   - public API or contract changes, and who calls them;
   @@extra.plannerTopics@@
6. For each decision with a trade-off, write an ADR: copy
   `docs/decisions/_template.md` to `docs/decisions/NNNN-<kebab-title>.md`,
   then run `scripts/ai/adr-index.sh` to rebuild the index in
   `docs/decisions/README.md` (never edit the index rows by hand; on a merge
   conflict in the index, take either side and run the script again). Get the
   number from `scripts/ai/next-adr-number.sh`, which reads the integration
   branch **and** every open PR branch, because parallel work collides. Run it
   again right before the commit if time has passed.
7. Record both:
   - Plan → issue. Read `gh issue view <n> --json body --jq .body`; add the
     `## Plan` section between the markers, or, when revising an existing one,
     post the previous section as a comment first
     (`gh issue comment <n> --body-file <prev>`), then replace it with
     `gh issue edit <n> --body-file <f>`. Post a comment with a 5-line summary
     and open questions for the user.
   - Plan status → labels. After writing the plan, ensure the issue carries
     `plan: draft` and not `plan: approved`
     (`gh label create plan:draft --color d4c5f9 --description "Plan awaiting approval"`
     first if the label does not exist). Revising a plan that had
     `plan: approved`: the revision returns the plan to `plan: draft`, and the
     revision comment notes that the previous approved plan is superseded.
   - ADR → commit: `docs(<scope>): ADR for #<n>`, summary in
     @@language.collab@@. The orchestrator pushes early (through the PR
     shepherd) so the ADR number is visible to parallel planners.

## Never

- Never change source code or tests.
- Never edit the plan while the issue carries `plan: approved` without turning
  it back into `plan: draft` first — the label is the signal that the plan is
  frozen and only the user may change it.
- Never regenerate the issue body from memory. Read it, replace only the text
  between `<!-- plan:start -->` and `<!-- plan:end -->`, and write it back.
- Never edit the plan without re-reading the body immediately before writing.
  The issue body has no merge: two sessions that each read and write it
  last-write-wins, and the slower one silently drops the other's text. If a
  second session may be working the same issue, say so in the summary and let
  the orchestrator serialize.
- Never supersede an ADR by deleting it. Write a new ADR that supersedes it and
  link both ways.

## Output

Issue number and the plan-comment URL, ADR paths (if any), a 5-line summary of
the approach, open questions for the user, then the `HANDOFF` block. The
orchestrator shows the plan to the user for approval before implementation.
