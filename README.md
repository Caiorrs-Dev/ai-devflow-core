# ai-devflow-core

The shared AI development cycle, packaged so any repository can adopt it and
keep it up to date:

- 10 tool-agnostic role briefs (`ai/agents/*.md`) plus preset roles, with a
  `HANDOFF` contract between them;
- the `ship-issue` orchestrator skill for Claude Code, and generated
  `.claude/agents/*.md` subagent wrappers;
- plan and ADR templates, and `scripts/ai/next-adr-number.sh`, which picks an
  ADR number that is free across every open PR branch;
- a `CLAUDE.md` with two managed blocks (`AGENTS.md` and `GEMINI.md` are
  symlinks to it);
- for Node projects: Husky hooks, commitlint, Biome 2, Knip, Vitest, and GitHub
  workflows for a `stage` → `main` gitflow with release-please and an automatic
  back-merge.

The `ai-flow` CLI copies it all in, renders the project's settings into it, and
reports drift.

## Quick start

```bash
# In the project repository (Node 20+):
npx github:caiorrs/ai-devflow-core init --preset node-ts
# later, to pull framework updates:
npx github:caiorrs/ai-devflow-core sync
# in CI or before a release, to fail on drift:
npx github:caiorrs/ai-devflow-core check
```

Pin a version with `#v0.1.0` after the repository name. Or add it as a dev
dependency (`"ai-devflow-core": "github:caiorrs/ai-devflow-core#v0.1.0"`) and
call `npx ai-flow sync`.

Then finish the setup the CLI cannot do (see [Repository setup](#repository-setup)).

## Presets

| Preset                     | Extends   | Adds                                                                                                  |
| -------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `node-ts`                  | —         | Biome, Knip, Vitest, Husky, commitlint, release-please, gitflow workflows                             |
| `typescript-vite-firebase` | `node-ts` | `rules-auditor` and `ui-auditor` roles, security-rules test job, a11y/tokens/analytics/sitemap duties |

`ai-flow presets` lists them. A new stack (Python, Go…) is a new folder under
`presets/` with its own `vars.json` commands, workflows and configs; `core/`
stays the same.

## How files are owned

Each layer (`core/`, then each preset in the `extends` chain) has:

| Folder       | Behavior on `sync`                                                                       | Examples                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `managed/`   | Overwritten every time. Do not edit these in the project.                                | role briefs, `ship-issue`, ADR/plan templates, commitlint/release-please/back-merge workflows, Husky hooks |
| `seed/`      | Written only when the file is missing; the project owns it after.                        | `CLAUDE.md`, ADR index, PR and issue templates, `biome.json`, `knip.json`, build and test workflows        |
| `skills.json` | Names third-party skills by source; the `skills` CLI installs them and locks them.       | `cursor/plugins`, `antfu/skills`, `addyosmani/web-quality-skills`                                          |
| `blocks/`    | Rewritten between `<!-- ai-flow:<name>:start -->` and `:end -->` markers in `CLAUDE.md`. | `shared-core`, `stack-preset`                                                                              |
| `roles.json` | One `.claude/agents/<role>.md` wrapper per role whose brief is synced.                   | model, tools, description                                                                                  |
| `vars.json`  | Template values, deep-merged in layer order.                                             | commands, branches, language                                                                               |

Managed Markdown, YAML and shell files carry a "Managed by ai-devflow-core"
note. JSON files cannot, so `ai-flow check` is the guard.

A later layer replaces an earlier file at the same path (the Firebase preset
replaces the `node-ts` `test.yml` seed, for example).

## Skills

Only one skill ships as a file: `ship-issue`, the orchestrator, because it is
ours. Everything else is third-party and is **not copied**. Each layer's
`skills.json` names skills by source, and the [`skills`
CLI](https://github.com/vercel-labs/skills) installs them and records exact
versions in `skills-lock.json`:

| Layer | `skills.json` | Skills |
|-------|---------------|--------|
| `core/` | `cursor/plugins` | `thermo-nuclear-code-quality-review` |
| `presets/node-ts/` | `antfu/skills`, `addyosmani/web-quality-skills` | `vitest`, `best-practices` |
| `presets/typescript-vite-firebase/` | `antfu/skills`, `vercel-labs/json-render`, `vercel-labs/agent-skills`, `addyosmani/web-quality-skills` | `vite`, `react`, `vercel-react-best-practices`, `accessibility`, `core-web-vitals`, `performance`, `seo`, `web-quality-audit` |

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
- `ai-flow check` exits 1 while a skill is missing from the lock; `sync` warns.
- `add` and `remove` edit `skills` and `disabledSkills` in `.ai-flow.json` and
  call the CLI. `remove` does not delete files already on disk.
- `disabledSkills` switches off a preset skill without touching the preset.
- Upstream changes reach you through `skills update`, not through this repo.

### A new machine

Global skills (personal, not project) come from `machine/global-skills.json`:

```bash
ai-flow skills global                     # install every skill in that file
ai-flow skills global caveman impeccable  # or just these
ai-flow skills snapshot --out machine/global-skills.json   # refresh from this machine
```

`global` runs the `skills` CLI with `-g`, so skills land in
`~/.agents/skills/` and `~/.claude/skills/`. `snapshot` reads the machine's
`~/.agents/.skill-lock.json`, so the file only ever lists what is installed
through the CLI.

To add a skill to a layer, add its source and name to that layer's
`skills.json`. Do not vendor the files: the upstream repo stays the source of
truth, and the lock pins the version.

## Project configuration: `.ai-flow.json`

```json
{
  "preset": "typescript-vite-firebase",
  "vars": {
    "language": { "collab": "Brazilian Portuguese", "docs": "English" },
    "release": { "packageName": "my-app" },
    "extra": {
      "implementerRules": "- Analytics go through `@/telemetry`.\n- Test labels follow TESTS.md."
    }
  },
  "disabledRoles": ["product-owner"],
  "skills": { "JuliusBrussee/caveman": ["caveman"] },
  "disabledSkills": ["seo"]
}
```

- `vars` override any preset var. `ai-flow vars` prints the resolved set.
  Multi-line values placed alone on an indented line keep that indentation.
- `disabledRoles` removes a role's brief and wrapper from the sync. The
  orchestrator skips roles whose brief does not exist. Files already on disk
  are not deleted; remove them by hand.

Templates use `@@dotted.name@@` placeholders, so GitHub Actions `${{ }}`
expressions pass through. An unknown var fails the sync and names the file.

## Repository setup

The CLI does not touch `package.json`, GitHub settings or secrets. It warns
about missing scripts and dev dependencies. For `node-ts`:

1. Dev dependencies: `@biomejs/biome knip vitest husky lint-staged
@commitlint/cli @commitlint/config-conventional`; run `npx husky init` once
   (then `ai-flow sync` again to restore the managed hooks).
2. Scripts: `lint` (`biome check .`), `lint:fix` (`biome check --write .`),
   `format` (`biome format --write .`), `build`, `knip`.
3. Branches: create `stage` from `main` and push it.
4. Branch protection on `stage` and `main`: require a PR and these status
   checks — **`Build & Type Check`**, **`Commitlint`**, **`Unit Tests`** (plus
   **`Security Rules Tests`** with the Firebase preset). Required checks match
   **job** names, not workflow names.
5. Secrets:
   - `BACK_MERGE_TOKEN`: a fine-grained PAT or GitHub App token with contents
     write that may bypass the `stage` protection. Without it the back-merge
     can push only to an unprotected `stage`.
   - `RELEASE_PLEASE_TOKEN` (recommended): contents and pull-requests write.
     With the default `GITHUB_TOKEN`, release PRs run no CI, so their required
     checks never report.
6. Squash-merge PRs, so the conventional PR title becomes the commit
   release-please reads.

## Adopting it in a repository that already has the cycle

1. `ai-flow init --preset <name> --dir .` refuses to run if `.ai-flow.json`
   exists; otherwise it writes it and syncs. Seeds you already have stay as
   they are.
2. Managed files that differ from your copies are overwritten. Review with
   `git diff`, and move anything project-specific into `.ai-flow.json` vars
   (`extra.*`) or the **Project** section of `CLAUDE.md`.
3. Your existing `CLAUDE.md` is kept. Add the two marker pairs where the shared
   blocks belong, delete the rules they duplicate, and sync again.
4. `AGENTS.md`/`GEMINI.md` that are not symlinks to `CLAUDE.md` produce a
   warning; merge and replace them.

## Limits

- `sync` never deletes files. A file removed upstream stays in the project
  until removed by hand.
- `next-adr-number.sh` sees only pushed branches. Two planners that pick a
  number before either pushes can still collide; the orchestrator pushes the
  plan commit early to narrow that window.
- The reviewer and planner use an external code-quality skill when it exists at
  `review.skillPath`; otherwise they fall back to the checklist in their brief.
- `skills` subcommands shell out to `npx -y skills`; set `AI_FLOW_SKILLS_CMD` to
  point at another CLI (the tests use a stub).

## Development

```bash
npm test   # node --test, no dependencies
```

Version with Conventional Commits and tags (`v0.3.0`); projects pin a tag.
