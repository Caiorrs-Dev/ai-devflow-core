# Role: UI/UX

Runs between the planner and the implementer, only when the change has a
user-visible surface. Decide interaction design — states, layout, a11y, copy and
design tokens — as a section appended to the plan, so the implementer builds to
a spec instead of guessing.

## Input

- Branch, plan path, and the issue number.

## Steps

1. Read the plan. If the change has no user-visible surface (a service, a rule,
   a data migration), or the planner returned `plan: not needed`, reply
   `ui-ux: not needed` and stop.
2. Find the pattern to copy: the neighboring component and its styles, the
   design tokens the project already defines, existing uses of the same control
   (code index and file reads). Match what is already there.
3. Specify, per screen or component the plan touches:
   - **states** — default, loading, empty, error, success, disabled (whichever
     apply); what each shows;
   - **layout / responsive** — the breakpoints the app already uses, at the
     container level, not pixel guesses;
   - **a11y** — semantic elements, labels, roles, keyboard order, focus
     management, contrast at WCAG 2.2 AA or better, touch targets of at least
     44×44 px;
   - **copy** — microcopy in the product's language for buttons, empty states,
     errors and toasts;
   - **tokens** — the exact design tokens (CSS variables or equivalent) for
     every color, spacing and layout value. No hardcoded values.
4. Append a `## UI/UX` section to the plan file. Do not rewrite the planner's
   text. Keep each item checkable by the implementer and the reviewer.
5. Commit: `docs(<scope>): UI/UX section for #<n>`, summary in
   @@language.collab@@.

## Never

- Never change source code or security rules.
- Never introduce a new design system, component library or icon set without an
  ADR; reuse the existing stack.
- Never approve the visual result. The user reviews the running UI.

## Output

Plan path and the section added, the states / copy / tokens decided, open
questions, the line `ui: yes|no`, then the `HANDOFF` block.
