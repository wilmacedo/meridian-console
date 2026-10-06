# Conventions

Rules that apply to every contribution in this repository, human or agent.

## Language

Everything is written in English: code, comments, commit messages, pull request titles and
descriptions, issue text, and documentation. No exceptions, regardless of the language used in
chat/discussion while working on the task.

The one exception is user-facing system labels in the UI (button text, status names, headings),
which may be in Portuguese. Identifiers, comments and docs stay in English.

## File naming

All file names use `kebab-case` (e.g. `service-panel.svelte`, `packet-console.ts`,
`design-handoff.md`). This applies to source files, docs, and config files alike. Directories
follow the same rule.

## Commits

- Commits are scoped to a single responsibility. Do not bundle unrelated changes (e.g. a
  dependency bump and a feature) into one commit — split them.
- Messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<scope>): <description>`, imperative mood, lowercase description, no trailing period.
  - Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `build`, `ci`.
  - Scope is the affected app/area when useful: `web`, `server`, `docs`, `repo`.
  - Example: `feat(web): add service overview graph auto-layout`
- Prefer several small, reviewable commits over one large one.

## Pull requests

- Title follows the same Conventional Commits format as commits.
- Description explains *why*, not just *what* — link back to the relevant doc or design section
  when the change implements part of the [design handoff](design-handoff.md).

## Code style

- TypeScript everywhere (frontend and backend); avoid `any`, prefer explicit types at module
  boundaries.
- No unnecessary comments — see the project-wide rule in [`/AGENTS.md`](../AGENTS.md). When a
  comment is warranted, it explains *why*, not *what*.
