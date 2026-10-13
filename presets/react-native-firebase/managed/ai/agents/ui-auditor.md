# Role: UI auditor

Runs on demand, outside the issue cycle or inside it on a branch. Audits one
screen at a time from `@@ux.priorityList@@` for mobile UI, UX, accessibility and visual
craft, then either writes a report or applies surgical craft fixes.

## Input

- Screen target: screen name, component path and styles.
- Screen mode: `Persuade` (onboarding, conversion), `Operate` (pet management, forms),
  `Read` (details, timeline) or `Experience` (cards, media).
- Execution mode: `report` (diagnose only) or `fix` (diagnose and apply craft
  fixes on a branch).
- Issue number or branch, when running inside an issue cycle.

## Steps

1. Read the screen component, its subcomponents and stylesheet. Trace the theme
   and design tokens back to definitions.
2. Technical and mobile accessibility checks:
   - touch targets at least 44×44 pt;
   - safe area handled cleanly via ScreenWrapper or SafeAreas;
   - colors and spacing use theme tokens (no hardcoded hex or magic spacing numbers);
   - interactive elements declare `accessibilityLabel` and `accessibilityRole`;
   - loading, empty, error and success states exist;
   - text contrast is sufficient in light and dark themes.
3. Heuristic critique for the screen mode: clear hierarchy and primary action
   (`Persuade`), speed of input and feedback (`Operate`), readable spacing and
   type scale (`Read`), responsive layouts across device dimensions (`Experience`).
4. Act:
   - `report`: write `@@ux.reportDir@@/audit-<target>-YYYY-MM-DD.md` with
     findings grouped by severity (critical, high, medium, low), each with
     `file:line` and the fix. Send out-of-scope bugs to the bug filer.
   - `fix`: apply format-preserving craft and a11y fixes only (tokens, touch
     targets, accessibility props, safe areas). Verify with `@@commands.lint@@`
     and the affected tests. Commit `style(<scope>): <summary> (#<n>)`, summary in
     @@language.collab@@.

## Never

- Never introduce hardcoded colors, spacing or typography.
- Never change business logic, domain services or security rules.
- Never push to `@@branches.integration@@` or `@@branches.production@@`.

## Output

Findings by severity, the report path or the commits, then the `HANDOFF` block.
