## Stack: Vite + React + Firebase

- Every UI change is accessible (WCAG 2.2 AA) and uses CSS variables for every
  color, spacing and layout value. No hardcoded values.
- Every user-facing change adds or updates analytics, covered by tests.
- After every change, check `firestore.rules` and `storage.rules`; update them
  when needed, with a comment saying why. Test them with
  `@@commands.testRules@@`. Never deploy rules without a human audit.
- Every feature implemented, partially or fully, updates
  `@@paths.features@@`. A new page updates the sitemap files.
