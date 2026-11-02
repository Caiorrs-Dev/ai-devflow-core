## EGM (Elephant-Goldfish Model)

- Design docs live in `@@egm.docsDir@@`. A non-trivial change gets a design doc
  before code: brainstorm the concept, then draft the doc section by section.
- Review is stateless by construction. The reviewer roles in `ai/agents/egm-*.md`
  read only the document and the code — never the conversation that produced
  them. Do not summarize the discussion into the review prompt; that defeats it.
- Run the review as a swarm: `egm-zoom-out`, `egm-comprehension`, `egm-design`,
  `egm-structural`, `egm-implementation-readiness`, and `egm-codebase-details`
  when the doc describes existing code. Consolidate with `egm-synthesizer`.
- Findings are `Blocker` / `Major` / `Nit`, each with `file:line` and evidence.
  Drop anything you cannot confirm in the code.
- The upstream skills are installed under `.agents/skills/egm-*`. They are
  user-invocable on purpose (`disable-model-invocation: true`): the harness will
  not load them by itself, so start a step with `/egm-review`, `/egm-brainstorm`
  or `/egm-draft`. A review swarm that spawns six subagents should be named, not
  guessed.
- Two pointers in the upstream skills do not resolve here —
  `${CLAUDE_PLUGIN_ROOT}`, `docs/harnesses.md` and `agents/<file>.md`. Ignore
  them: the personas are the roles installed at `ai/agents/egm-*.md`.
- Those role briefs are a port of the upstream `agents/*.md`. Re-read the
  upstream personas when you bump the skills; an upstream change does not reach
  `ai/agents/egm-*.md` on its own.
