# Changelog

Release notes from v0.4.0 on are written by release-please from Conventional
Commits. Earlier versions were tagged by hand; their notes are reconstructed
from the commit history below.

## [0.8.7](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.6...v0.8.7) (2026-11-02)


### Bug Fixes

* **deps:** support biome 2.6.3 formatting and schema ([09b1a44](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/09b1a44502860b5b243d11ed017fb080cd547601))

## [0.8.6](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.5...v0.8.6) (2026-11-02)

### Bug Fixes

- CI runner access to private core repo and husky shellcheck false positive ([#84](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/84)) ([04f8f73](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/04f8f73db486cdbe2a75dd50b61a5195fed7d68f))

## [0.8.5](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.4...v0.8.5) (2026-11-02)

### Bug Fixes

- https npm spec, style-free pipeline lint, per-manager audit ([#44](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/44) [#45](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/45)) ([#83](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/83)) ([e5a9848](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e5a9848b2dee75ff82c7e891827a27fe6e0b2992))
- skip husky's .husky/_ shim directory in the localFiles walk ([#80](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/80)) ([5a03745](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/5a03745bda94bfbf10833c6a0d5fdfbd2b8d0ab9))

## [0.8.4](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.3...v0.8.4) (2026-11-02)

### Bug Fixes

- runner-safe installs and scans in the managed workflows ([#44](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/44) [#45](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/45)) ([#77](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/77)) ([19d5ad2](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/19d5ad2f6bd8d58581b0fcf8768cd33aa7e2f659))

## [0.8.3](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.2...v0.8.3) (2026-11-02)

### Bug Fixes

- accept localFiles entries in subdirectories of managed dirs ([#75](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/75)) ([a503025](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/a503025147b1556ca9a856eb48378c690b7436eb))

## [0.8.2](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.1...v0.8.2) (2026-11-02)

### Bug Fixes

- accept localFiles as a config key ([#20](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/20)) ([#73](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/73)) ([8ac0ba1](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/8ac0ba170323754a347a8a67c2b068761f871ff5))

## [0.8.1](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.8.0...v0.8.1) (2026-11-02)

### Bug Fixes

- seed directories are not managed directories for localFiles ([#20](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/20)) ([#71](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/71)) ([5939103](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/5939103dfef815d85c6ac13848ba93303752e12e))

## [0.8.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.7.0...v0.8.0) (2026-11-02)

### Features

- CI-verification upgrades — security scan workflow, opt-in e2e/a11y/perf gates ([#41](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/41)) ([#66](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/66)) ([966031e](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/966031e55e8af1322a639c8b2d799d8bc1f9b5f5))
- CI/CD upgrades — pipeline lint for consumers, previews, env separation, deploy gate ([#45](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/45)) ([#70](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/70)) ([faeebef](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/faeebef070c8174ebad2e212d764e51fef35193d))
- ideation-stage upgrades — spec-writer, RICE backlog, definition-of-ready, feature flags ([#38](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/38)) ([#63](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/63)) ([f2dfc8f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/f2dfc8fb140d7799c6919a2ed98c5b07431b19e8))
- meta upgrades — done-claims, scope guard, human gates, cost, brief evals ([#43](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/43)) ([#68](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/68)) ([1805727](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/180572712b66ad088a5efc67cb69bcbe47cd7796))
- plan status labels, minimal-issue fast path, plan-guarantee decision ([#34](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/34) [#35](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/35) [#36](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/36)) ([#62](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/62)) ([c3253e5](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/c3253e5533dad8d60713affedee92323b25b6e1f))
- planning-stage upgrades — edge-case checklist, migration design, contract guards ([#39](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/39)) ([#64](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/64)) ([88c3901](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/88c390117cfbe413a5edf45a21cfc1a5901d534c))
- post-merge loop — production evidence, rollout stages, release notes, postmortems, docs freshness ([#42](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/42)) ([#67](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/67)) ([59c921e](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/59c921e7c051e8254526c09c161ce7f026c14b24))
- render the workflow install step from commands.install vars ([#15](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/15)) ([#58](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/58)) ([7dbe537](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/7dbe537acf1950aeecb871c5db57edc0e1ab47e0))
- run ai-flow check --strict in consumers' CI ([#20](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/20)) ([#61](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/61)) ([4c50819](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/4c508198214a9845d5d1ed603542897173c14bfd))
- security upgrades — threat modeler, dependency review, agent-surface hardening ([#44](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/44)) ([#69](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/69)) ([6ec4dd2](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/6ec4dd2b3b790b9e308b7996141a14ced2d1f1d8))
- test-quality upgrades — coverage runs, mutation hook, property tests, scenario mapping ([#40](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/40)) ([#65](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/65)) ([e74bb6e](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e74bb6e75e2f29ade8b56fac18f77917844d676c))

## [0.7.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.6.0...v0.7.0) (2026-11-02)

### Features

- **egm:** add opt-in egm mixin and project-level extends ([#55](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/55)) ([dee5bfd](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/dee5bfd1c6f88538359eac3df68eb73912055d01))

## [0.6.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.5.1...v0.6.0) (2026-11-02)

### Features

- **core:** seed FEATURES.md and a backlog priority report ([#50](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/50)) ([472e8f0](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/472e8f049f04068d2cd864c128e0f0bee6150bc9))
- require an issue and write plans to the issue, not files ([#31](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/31)) ([e727280](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e72728019f9b7f013a15aded893a997f505eda10)), closes [#30](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/30)


### Bug Fixes

- **adr:** page through open PRs when picking the next ADR number ([#47](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/47)) ([0b100fa](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/0b100fa24b5115da9bb61741d6a9ba38575c2219))
- **lint-staged:** cover .mjs/.cjs and document the md/yml exclusion ([#48](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/48)) ([dbff616](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/dbff6162fdd7d4c869561bdb7db810e28893f898))
- **node-base:** seed Node 22 so workflows match engines and @types/node ([#49](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/49)) ([0109087](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/0109087c3f964526e689dd7b01f987d0135da21e))
- **skills:** stop shipping the maintainer's global manifest ([#51](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/51)) ([540842f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/540842f81418e866d8528b338bf38ecdde3314ac))
- warn when commands.* and a workflow install with different managers ([#17](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/17)) ([e000b84](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e000b84664b5ebe433166312d60e7bda27e6777c))

## [0.5.1](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.5.0...v0.5.1) (2026-10-14)

### Bug Fixes

- symlink-safe sync, skill input validation and smaller fixes ([#12](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/12)) ([948d3e2](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/948d3e28e7624b3f32a784b196f6779ae5bb1c66))

## [0.5.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.4.1...v0.5.0) (2026-10-14)

### ⚠ BREAKING CHANGES

- require Node 22 and type-check against it ([#10](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/10))

### Build System

- require Node 22 and type-check against it ([#10](https://github.com/Caiorrs-Dev/ai-devflow-core/issues/10)) ([9f25644](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/9f25644fb8124dab53896263ca065e31717fb8dd))

## [0.4.1](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.4.0...v0.4.1) (2026-10-14)

### Bug Fixes

- **sync:** do not link AGENTS.md and GEMINI.md to a missing CLAUDE.md ([6faca3f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/6faca3f998df5f44bd7fe68cfd0ea49527cedc38))
- **sync:** never remove files outside the project ([28fd30f](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/28fd30f01fdc7bcddf50227ed2c55dfe7b18f647))
- **sync:** never touch files outside the project; no links to a missing CLAUDE.md ([f46d33a](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/f46d33a24cf3b95702013729da677c63a2b33a18))

## [0.4.0](https://github.com/Caiorrs-Dev/ai-devflow-core/compare/v0.3.0...v0.4.0) (2026-10-14)

### ⚠ BREAKING CHANGES

- **cli:** role briefs and wrappers no longer name rtk, CodeGraph or the CodeGraph MCP tool; set agents.toolRules and agents.extraTools to keep them. The firebase rules job moved to rules-test.yml, and issue templates are now issue forms (existing projects keep their files).

### Features

- **cli:** add sync lock, preset mixins, doctor and diff ([e5002c0](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/e5002c03627e86f93cc0d1bc8e440b0d21436c53))
- **doctor:** check that release-please can open its PR ([67f4682](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/67f4682b432d832e2abf9f3b2fb148b3e9d05ed5))


### Bug Fixes

- **doctor:** count organization secrets shared with the repository ([7272863](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/72728631bf2c8bb4855191c60a9526245ddaaa99))
- **release:** bump the minor for breaking changes before 1.0 ([6e11d69](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/6e11d699181f371a06b8bbbec02fe5e8eaeaa2db))
- **release:** unblock release-please and stop the 1.0.0 bump ([2793de7](https://github.com/Caiorrs-Dev/ai-devflow-core/commit/2793de7d23c43e052137f19a083aabf33c0581b6))

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
