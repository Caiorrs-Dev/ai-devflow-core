# Decision records (ADRs)

One file per decision: the technical and product choices this project makes,
and *why*, at the moment they were made. A log kept going forward.

> `CLAUDE.md` requires an ADR for every decision with a trade-off and a plan
> (in the issue's `## Plan` section) for every non-trivial change, both linked
> from the PR.

## When to write an ADR

Write one whenever a choice is **hard to reverse or surprising to a newcomer**:

- picking a tool, library, platform or data store over an obvious alternative;
- a pattern the rest of the code must follow (caching, auth, data scoping);
- accepting a real trade-off, or knowingly leaving a gap.

Skip it for routine code.

## Naming and format

- File: `NNNN-short-title.md`, 4-digit zero-padded. Get the number from
  `scripts/ai/next-adr-number.sh`: it checks open PR branches too, so parallel
  branches do not take the same number.
- Copy [`_template.md`](./_template.md). Keep it to one screen.
- **Status:** `Proposed`, `Accepted`, `Deprecated` or `Superseded by ADR-NNNN`.
  Never delete an ADR: supersede it and link both ways.
- Added an ADR, or changed its status? Run `scripts/ai/adr-index.sh`: it
  rebuilds the index below from the ADR files. Do not edit the rows by hand;
  on a merge conflict in the index, take either side and run it again.

## Index

<!-- adr-index:start -->
| ADR | Title | Status |
|-----|-------|--------|
<!-- adr-index:end -->
