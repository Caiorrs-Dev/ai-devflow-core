# Contributing

## Setup

Node 22 or later. `@types/node` follows the oldest supported Node, so `tsc`
rejects newer runtime APIs.

```bash
npm ci        # dev tools only: Biome, TypeScript; the CLI has no runtime dependencies
npm test      # node --test
npm run lint
npm run typecheck   # tsc --checkJs over the JSDoc in bin/, lib/, scripts/
npm run render      # renders every preset into rendered/ for a look
```

CI also runs `actionlint` and `shellcheck` on the rendered presets, and the
tests on Linux, macOS and Windows.

## Layout

| Path | What |
|---|---|
| `bin/ai-flow.mjs` | Argument parsing and commands. |
| `lib/plan.mjs` | Resolves layers, vars, roles, skills into a plan. |
| `lib/reconcile.mjs` | Compares the plan with a project; writes files and `.ai-flow.lock.json`. |
| `lib/skills.mjs` | `skills` subcommands (delegates to the `skills` CLI). |
| `lib/doctor.mjs` | `doctor` (GitHub checks through `gh`). |
| `core/` | The layer every project gets. |
| `presets/<name>/` | Stack layers. `preset.json` `extends` one name or a list; `"mixin": true` marks a layer that only makes sense extended. |
| `schema/ai-flow.schema.json` | JSON Schema for a project's `.ai-flow.json`. |

## Adding a preset

1. Create `presets/<name>/preset.json` with `description`, `extends`, and
   `requires` (`packageScripts`, `devDependencies`, `checks` — the required
   status check names its workflows produce — and `secrets`).
2. Add only what differs from the parents: `vars.json`, `managed/`, `seed/`,
   `blocks/stack-preset.md`, `roles.json` (+ `managed/ai/agents/<role>.md`),
   `skills.json`.
3. Blocks are appended in layer order, never replaced: a parent must not say
   anything a child contradicts. Put shared groundwork in a base layer (see
   `node-base`) and the choice in the child (`node-ts` adds Vitest,
   `react-native-firebase` adds Jest).
4. If a new seed replaces one older projects already have under another name,
   add a `seeds.json` rule (`skipIf`) so sync does not create both.
5. The init test iterates every preset; add assertions for anything specific.

## Adding a var

Put the default in the lowest layer that uses it (`core/vars.json` for core
templates), document it in `schema/ai-flow.schema.json` when projects are
expected to override it, and use it as `@@dotted.name@@`. Arrays render as JSON;
a multi-line string alone on an indented line keeps that indentation.

## Pinning actions

Workflows pin actions to a commit SHA with the tag in a comment. Dependabot
updates this repository's own pins; update the template pins in the same PR.

## Commits and releases

Conventional Commits, squash-merged: the repository allows squash merges only,
so the PR title becomes the commit release-please reads. A merge commit hides
the PR's commits from release-please when they are older than the last
release. release-please opens the release PR on `main`; merging it tags
`vX.Y.Z`, which projects pin.
