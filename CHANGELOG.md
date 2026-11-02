# Changelog

Release notes from v0.4.0 on are written by release-please from Conventional
Commits. Earlier versions were tagged by hand; their notes are reconstructed
from the commit history below.

## [0.7.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.6.0...v0.7.0) (2026-11-02)


### Features

* **egm:** add opt-in egm mixin and project-level extends ([#55](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/55)) ([dee5bfd](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/dee5bfd1c6f88538359eac3df68eb73912055d01))

## [0.6.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.5.1...v0.6.0) (2026-11-02)


### Features

* **core:** seed FEATURES.md and a backlog priority report ([#50](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/50)) ([472e8f0](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/472e8f049f04068d2cd864c128e0f0bee6150bc9))
* require an issue and write plans to the issue, not files ([#31](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/31)) ([e727280](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e72728019f9b7f013a15aded893a997f505eda10)), closes [#30](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/30)


### Bug Fixes

* **adr:** page through open PRs when picking the next ADR number ([#47](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/47)) ([0b100fa](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/0b100fa24b5115da9bb61741d6a9ba38575c2219))
* **lint-staged:** cover .mjs/.cjs and document the md/yml exclusion ([#48](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/48)) ([dbff616](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/dbff6162fdd7d4c869561bdb7db810e28893f898))
* **node-base:** seed Node 22 so workflows match engines and @types/node ([#49](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/49)) ([0109087](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/0109087c3f964526e689dd7b01f987d0135da21e))
* **skills:** stop shipping the maintainer's global manifest ([#51](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/51)) ([540842f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/540842f81418e866d8528b338bf38ecdde3314ac))
* warn when commands.* and a workflow install with different managers ([#17](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/17)) ([e000b84](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e000b84664b5ebe433166312d60e7bda27e6777c))

## [0.5.1](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.5.0...v0.5.1) (2026-10-14)


### Bug Fixes

* symlink-safe sync, skill input validation and smaller fixes ([#12](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/12)) ([948d3e2](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/948d3e28e7624b3f32a784b196f6779ae5bb1c66))

## [0.5.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.4.1...v0.5.0) (2026-10-14)


### ⚠ BREAKING CHANGES

* require Node 22 and type-check against it ([#10](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/10))

### Build System

* require Node 22 and type-check against it ([#10](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/10)) ([9f25644](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/9f25644fb8124dab53896263ca065e31717fb8dd))

## [0.4.1](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.4.0...v0.4.1) (2026-10-14)


### Bug Fixes

* **sync:** do not link AGENTS.md and GEMINI.md to a missing CLAUDE.md ([6faca3f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/6faca3f998df5f44bd7fe68cfd0ea49527cedc38))
* **sync:** never remove files outside the project ([28fd30f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/28fd30f01fdc7bcddf50227ed2c55dfe7b18f647))
* **sync:** never touch files outside the project; no links to a missing CLAUDE.md ([f46d33a](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/f46d33a24cf3b95702013729da677c63a2b33a18))

## [0.4.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.3.0...v0.4.0) (2026-10-14)


### ⚠ BREAKING CHANGES

* **cli:** role briefs and wrappers no longer name rtk, CodeGraph or the CodeGraph MCP tool; set agents.toolRules and agents.extraTools to keep them. The firebase rules job moved to rules-test.yml, and issue templates are now issue forms (existing projects keep their files).

### Features

* **cli:** add sync lock, preset mixins, doctor and diff ([e5002c0](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e5002c03627e86f93cc0d1bc8e440b0d21436c53))
* **doctor:** check that release-please can open its PR ([67f4682](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/67f4682b432d832e2abf9f3b2fb148b3e9d05ed5))


### Bug Fixes

* **doctor:** count organization secrets shared with the repository ([7272863](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/72728631bf2c8bb4855191c60a9526245ddaaa99))
* **release:** bump the minor for breaking changes before 1.0 ([6e11d69](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/6e11d699181f371a06b8bbbec02fe5e8eaeaa2db))
* **release:** unblock release-please and stop the 1.0.0 bump ([2793de7](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/2793de7d23c43e052137f19a083aabf33c0581b6))

## 0.3.0

### Features

- **skills:** reference third-party skills by source instead of vendoring them.

### Bug Fixes

- **presets:** grant `pull-requests: read` to paths-filter in test workflows.

## 0.2.1

### Bug Fixes

- ship catalog skills in the npm package.

## 0.2.0

### Features

- sync skills into `.agents/skills` and install global skills.
- **preset:** add the `react-native-firebase` preset.

## 0.1.1

### Bug Fixes

- **node-ts:** skip the back-merge when `main` and `stage` trees are equal.

## 0.1.0

- Initial `ai-devflow-core` with the `node-ts` and `typescript-vite-firebase`
  presets.
