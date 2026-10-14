# ai-devflow-core

The shared AI development cycle, packaged so any repository can adopt it and
keep it up to date:

- 10 tool-agnostic role briefs (`ai/agents/*.md`) plus preset roles, with a
  `HANDOFF` contract between them;
- the `ship-issue` orchestrator skill for Claude Code, and generated
  `.claude/agents/*.md` subagent wrappers;
- plan and ADR templates, `scripts/ai/next-adr-number.sh` (an ADR number that is
  free across every open PR branch) and `scripts/ai/adr-index.sh` (rebuilds the
  ADR index);
- a `CLAUDE.md` with two managed blocks (`AGENTS.md` and `GEMINI.md` are
  symlinks to it, or copies where symlinks are not available);
- for Node projects: Husky hooks, commitlint, Biome 2, Knip, a test runner, and
  GitHub workflows for a `stage` → `main` gitflow with release-please and an
  automatic back-merge.

The `ai-flow` CLI copies it all in, renders the project's settings into it,
records what it wrote in `.ai-flow.lock.json`, and reports drift.

## Quick start

```bash
# In the project repository (Node 20+):
npx github:Caiorrs-Dev/ai-devflow-core#v0.3.0 init --preset node-ts
# later, to pull framework updates (bump the tag first):
npx github:Caiorrs-Dev/ai-devflow-core#v0.3.0 sync
# in CI or before a release, to fail on drift:
npx github:Caiorrs-Dev/ai-devflow-core#v0.3.0 check
```

Always pin a tag: an unpinned `check` compares against the latest `main`, so
every upstream change would fail your CI until you sync. Or add it as a dev
dependency (`"ai-devflow-core": "github:Caiorrs-Dev/ai-devflow-core#v0.3.0"`)
and call `npx ai-flow sync`. `check` warns when the lock file was written by
another version.

Then finish the setup the CLI cannot do (see [Repository setup](#repository-setup))
and verify it with `ai-flow doctor`.

## Presets

| Preset                     | Extends               | Adds                                                                                       |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `node-base`                | —                     | Biome, Knip, Husky, commitlint, release-please, gitflow workflows, Dependabot; no test runner |
| `node-ts`                  | `node-base`           | Vitest, the `Unit Tests` workflow                                                          |
| `typescript-vite-firebase` | `node-ts`, `firebase` | `ui-auditor` role, a11y/tokens/analytics/sitemap duties                                    |
| `react-native-firebase`    | `node-base`, `firebase` | Jest and its `Unit Tests` workflow, `ui-auditor` role, safe areas and mobile tokens      |

| Mixin      | Adds                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `firebase` | `rules-auditor` role, the `Security Rules Tests` workflow, the rules duties |

`ai-flow presets` lists them. `extends` takes one name or a list; a mixin is a
layer that only makes sense extended, so `init` refuses it. A new stack
(Python, Go…) is a new folder under `presets/`; see
[CONTRIBUTING.md](./CONTRIBUTING.md).

## How files are owned

Each layer (`core/`, then each preset in the `extends` graph, parents first)
has:

| Folder or file | Behavior on `sync`                                                                       | Examples                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `managed/`     | Overwritten every time; removed when no longer part of the plan. Do not edit in place.   | role briefs, `ship-issue`, ADR/plan templates, commitlint/release-please/back-merge workflows, Husky hooks |
| `seed/`        | Written once. The project owns it after, and a seed the project deletes stays deleted.   | `CLAUDE.md`, ADR index, PR and issue templates, `biome.json`, `knip.json`, build and test workflows        |
| `blocks/`      | Rewritten between `<!-- ai-flow:<name>:start -->` and `:end -->` markers in `CLAUDE.md`; layers append in order. | `shared-core`, `stack-preset`                                                    |
| `roles.json`   | One `.claude/agents/<role>.md` wrapper per role whose brief is synced.                   | model, tools, description                                                                                  |
| `vars.json`    | Template values, deep-merged in layer order.                                             | commands, branches, language                                                                               |
| `skills.json`  | Names third-party skills by source; the `skills` CLI installs and locks them.            | `cursor/plugins`, `antfu/skills`                                                                           |
| `seeds.json`   | Skip a seed when the project already has an older equivalent.                            | issue forms next to old `.md` templates                                                                    |

Managed Markdown, YAML and shell files carry a "Managed by ai-devflow-core"
note. JSON files cannot, so `ai-flow check` is the guard.

A later layer replaces an earlier file at the same path.

### `.ai-flow.lock.json`

Commit it. `sync` writes it with the ai-devflow-core version and every managed
file's hash, so the CLI can:

- remove managed files that a newer version dropped, or that you disabled
  (unless you edited them: then it warns and leaves them);
- write each seed once: delete a seed you do not want and it stays deleted;
- tell `edited locally` from `outdated` in `check` and `diff`.

## Commands

```bash
ai-flow init --preset <name>     # write .ai-flow.json, then sync (--force changes the preset)
ai-flow sync [--dry-run]         # apply the plan
ai-flow check [--strict] [--json]  # exit 1 on drift; --strict also on warnings
ai-flow diff                     # unified diff of what sync would change
ai-flow doctor                   # GitHub setup: branches, required checks, merge methods, secrets
ai-flow presets | roles | vars   # inspect
ai-flow --help | --version
```

## Skills

Only one skill ships as a file: `ship-issue`, the orchestrator, because it is
ours. Everything else is third-party and is **not copied**. Each layer's
`skills.json` names skills by source, and the [`skills`
CLI](https://github.com/vercel-labs/skills) installs them and records exact
versions in `skills-lock.json`:

| Layer | Skills |
|-------|--------|
| `core/` | `cursor/plugins`: `thermo-nuclear-code-quality-review` |
| `presets/node-ts/` | `antfu/skills`: `vitest`; `addyosmani/web-quality-skills`: `best-practices` |
| `presets/typescript-vite-firebase/` | `antfu/skills`: `vite`; `vercel-labs/json-render`: `react`; `vercel-labs/agent-skills`: `vercel-react-best-practices`; `addyosmani/web-quality-skills`: `accessibility`, `core-web-vitals`, `performance`, `seo`, `web-quality-audit` |
| `presets/react-native-firebase/` | `vercel-labs/agent-skills`: `vercel-react-best-practices` |

`ai-flow` resolves core + preset + your `.ai-flow.json` into one list, then
delegates to the `skills` CLI. Skills land in `.agents/skills/<name>/` with a
symlink in `.claude/skills/<name>`, the layout every agent reads.

```bash
ai-flow skills                # resolved list, and what the lock is missing
ai-flow skills install        # install the missing ones (writes skills-lock.json)
ai-flow skills restore        # fresh clone: restore everything in skills-lock.json
ai-flow skills add <owner/repo> <skill...>
ai-flow skills remove <skill...>
```

- Commit `skills-lock.json`. Anyone who clones runs `ai-flow skills restore`
  (or `npx skills experimental_install`) and gets the same versions.
- `ai-flow check` exits 1 while a skill is missing from the lock, or is locked
  from a different source than the preset asks for; `sync` warns.
- `install` tries every source and exits 1 if any failed, listing them.
- `add` installs first and edits `.ai-flow.json` only when that worked.
  `remove` uninstalls and adds the skill to `disabledSkills`. Both write
  nothing with `--dry-run`.
- `disabledSkills` switches off a preset skill without touching the preset.
- Upstream changes reach you through `skills update`, not through this repo.

### A new machine

Global skills (personal, not project) come from `machine/global-skills.json`,
which is the maintainer's own list: point `--file` at yours.

```bash
ai-flow skills global                     # install every skill in that file
ai-flow skills global caveman impeccable  # or just these (unknown names fail)
ai-flow skills snapshot --out machine/global-skills.json   # refresh from this machine
```

`global` runs the `skills` CLI with `-g`, so skills land in
`~/.agents/skills/` and `~/.claude/skills/`. `snapshot` reads the machine's
`~/.agents/.skill-lock.json`, so the file only ever lists what is installed
through the CLI.

## Project configuration: `.ai-flow.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/Caiorrs-Dev/ai-devflow-core/main/schema/ai-flow.schema.json",
  "preset": "typescript-vite-firebase",
  "vars": {
    "language": { "collab": "Brazilian Portuguese", "docs": "English" },
    "extra": {
      "implementerRules": "- Analytics go through `@/telemetry`.\n- Test labels follow TESTS.md."
    },
    "agents": {
      "toolRules": "- Prefix shell commands with `rtk` when it is installed.\n- When `.codegraph/` exists, use CodeGraph (`codegraph explore \"<query>\"`) before grep or file reads.",
      "extraTools": ["mcp__codegraph__codegraph_explore"]
    }
  },
  "disabledRoles": ["product-owner"],
  "disabledFiles": [".github/workflows/back-merge.yml"],
  "skills": { "JuliusBrussee/caveman": ["caveman"] },
  "disabledSkills": ["seo"]
}
```

- `vars` override any preset var. `ai-flow vars` prints the resolved set.
  Multi-line values placed alone on an indented line keep that indentation;
  arrays render as JSON. `project.name` and `project.version` come from
  `package.json`, and `release.packageName` defaults to the name.
- `agents.toolRules` and `agents.extraTools` add your own tooling (a shell
  prefix, a code index, MCP tools) to every role. The defaults name no tool.
- `disabledRoles` leaves a role's brief and wrapper out; `disabledFiles` leaves
  any managed file or seed out. Managed files synced before are removed.
- Unknown keys, and names in `disabledRoles`/`disabledFiles`/`disabledSkills`
  that match nothing, produce warnings. The schema gives editors completion.

Templates use `@@dotted.name@@` placeholders, so GitHub Actions `${{ }}`
expressions pass through. An unknown var fails the sync and names the file; a
var that would make a JSON seed invalid fails it too.

## Repository setup

The CLI does not touch `package.json`, GitHub settings or secrets. It warns
about missing scripts and dev dependencies, and `ai-flow doctor` checks the
GitHub side. For `node-ts`:

1. Dev dependencies: `@biomejs/biome knip typescript vitest husky lint-staged
@commitlint/cli @commitlint/config-conventional`; run `npx husky init` once
   (then `ai-flow sync` again to restore the managed hooks). If your
   `package.json` already has a `lint-staged` field, delete the seeded
   `.lintstagedrc.json` (it is not written again), or add it to
   `disabledFiles` before the first sync.
2. Scripts: `lint` (`biome check .`), `lint:fix` (`biome check --write .`),
   `format` (`biome format --write .`), `build`, `knip`.
3. Branches: create `stage` from `main` and push it.
4. Branch protection or rulesets on `stage` and `main`: require a PR and these
   status checks — **`Build & Type Check`**, **`Commitlint`**, **`Unit
   Tests`** (plus **`Security Rules Tests`** with the `firebase` mixin).
   Required checks match **job** names, not workflow names.
5. Secrets:
   - `BACK_MERGE_TOKEN`: a fine-grained PAT or GitHub App token with contents
     write that may bypass the `stage` protection. Without it the back-merge
     can push only to an unprotected `stage`.
   - `RELEASE_PLEASE_TOKEN` (recommended): contents and pull-requests write.
     With the default `GITHUB_TOKEN`, release PRs run no CI, so their required
     checks never report, and the release job fails unless **Settings >
     Actions > General > Allow GitHub Actions to create and approve pull
     requests** is on.
6. Merge methods: allow squash merges for feature PRs, so the conventional PR
   title becomes the commit release-please reads, and merge commits for the
   `stage` → `main` promotion PR, so release-please sees every commit (see
   `ai/WORK_ON_GH_ISSUE.md`).

The seeded `.github/dependabot.yml` opens weekly update PRs against `stage`,
including for the actions the workflows pin by commit SHA.

## Adopting it in a repository that already has the cycle

1. `ai-flow init --preset <name> --dir .` refuses to run if `.ai-flow.json`
   exists; otherwise it writes it and syncs. Seeds you already have stay as
   they are.
2. Managed files that differ from your copies are overwritten. Review with
   `ai-flow diff` first, and move anything project-specific into
   `.ai-flow.json` vars (`extra.*`, `agents.*`) or the **Project** section of
   `CLAUDE.md`.
3. Your existing `CLAUDE.md` is kept. Add the two marker pairs where the shared
   blocks belong, delete the rules they duplicate, and sync again.
4. `AGENTS.md`/`GEMINI.md` that are not symlinks to `CLAUDE.md` produce a
   warning; merge and replace them.

## Upgrading from 0.3

- Commit the `.ai-flow.lock.json` the first sync writes. Before it exists,
  `check` reports it as missing.
- `node-ts` now extends `node-base`; `react-native-firebase` extends
  `node-base` and the new `firebase` mixin, so it no longer gets Vitest
  instructions, checks or skills.
- The Firebase rules job moved to its own seed, `rules-test.yml`. A project
  whose `test.yml` already has the `Security Rules Tests` job does not get it.
- Issue templates are now issue forms (`.yml`). A project with the old `.md`
  templates does not get them.
- The role briefs no longer name `rtk` or CodeGraph, and the wrappers no longer
  list the CodeGraph MCP tool. Set `agents.toolRules` and `agents.extraTools`
  (example above) to keep them.
- Template workflows pin actions to commit SHAs. Seeds you already have are
  not touched: update their pins by hand, or delete a seed before your first
  0.4 sync so it is written again (after that sync, a deleted seed stays
  deleted).

## Limits

- `next-adr-number.sh` sees only pushed branches. Two planners that pick a
  number before either pushes can still collide; the orchestrator pushes the
  plan commit early to narrow that window.
- The reviewer and planner use an external code-quality skill when it exists at
  `review.skillPath`; otherwise they fall back to the checklist in their brief.
- `skills` subcommands shell out to `npx -y skills`; set `AI_FLOW_SKILLS_CMD` to
  another CLI (a JSON array, or a command line with quotes around paths that
  contain spaces). `doctor` uses `gh`, replaceable with `AI_FLOW_GH_CMD`.
- On Windows without symlink rights, `AGENTS.md` and `GEMINI.md` are copies of
  `CLAUDE.md` that `sync` refreshes. `AI_FLOW_NO_SYMLINK=1` forces copies.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md). `npm test` needs no install; `npm ci`
adds Biome and TypeScript for `npm run lint` and `npm run typecheck`.

Released with Conventional Commits and release-please (`v0.3.0`, …); projects
pin a tag. Licensed under [MIT](./LICENSE).
