## Stack: Node + TypeScript

- Lint and format with Biome: `@@commands.lintFix@@` and `@@commands.format@@`;
  check with `@@commands.lint@@`.
- Typecheck with `@@commands.typecheck@@`; build with `@@commands.build@@`.
- Run `@@commands.deadCode@@` (Knip) after changes. Before you remove what it
  reports, prove it is unused.
- Never silence a check with `biome-ignore`, `@ts-ignore`, `@ts-expect-error`
  or `any`.
