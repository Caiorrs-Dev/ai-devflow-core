# Changelog

Release notes from v0.4.0 on are written by release-please from Conventional
Commits. Earlier versions were tagged by hand; their notes are reconstructed
from the commit history below.

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
