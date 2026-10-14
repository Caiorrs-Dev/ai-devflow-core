## Stack: React Native

- Unit tests with Jest in quiet mode: `@@commands.test@@`. Never use watch
  mode.
- UI: wrap every screen in @@ux.safeArea@@. Use design tokens and theme values
  for every color, spacing and typography; no hardcoded values or magic
  numbers.
- Accessibility: set `accessibilityLabel`, `accessibilityRole` and touch targets
  (minimum 44×44 pt) on all interactive elements.
- Every user-facing change adds or updates analytics, covered by tests.
- Every feature implemented, partially or fully, updates
  `@@paths.features@@`.
