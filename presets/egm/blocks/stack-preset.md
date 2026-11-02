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
- The upstream skills are installed under `.agents/skills/egm-*`. They may
  disable automatic invocation; read the `SKILL.md` file directly when the
  harness does not trigger them.
