## Stack: React Native + Firebase

- UI: wrap screens in `ScreenWrapper` for safe area handling. Use design tokens
  and theme values for every color, spacing and typography; no hardcoded
  values or magic numbers.
- Accessibility: set `accessibilityLabel`, `accessibilityRole` and touch targets
  (minimum 44×44 pt) on all interactive elements.
- Every user-facing change adds or updates analytics, covered by tests.
- After every change, check `firestore.rules` and `storage.rules`; update them
  when needed, with a comment saying why. Never deploy rules without a human
  audit.
- Every feature implemented, partially or fully, updates
  `@@paths.features@@`.
