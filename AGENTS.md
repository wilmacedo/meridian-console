# AGENTS.md

Rules and reference docs for anyone — human or agent — working in this repository.

## Project

Meridian Console: a control plane for a self-hosted homelab (headless Debian box). Frontend in
Svelte + Vite + TypeScript, backend in Fastify + TypeScript, pnpm workspaces. Full context:

- [`docs/architecture.md`](docs/architecture.md) — stack, why, layout, data flow.
- [`docs/design-handoff.md`](docs/design-handoff.md) — the visual/behavioural source of truth
  (tokens, screens, interactions). Match it in fidelity; see its "About the Design Files" section
  for how to adapt the reference HTML to Svelte.
- [`docs/conventions.md`](docs/conventions.md) — language, file naming, commit, and PR rules.

## Non-negotiables (summary)

- English only: code, comments, commits, PRs, docs.
- File names in `kebab-case`.
- Commits are Conventional Commits, one responsibility per commit.
- No comments explaining *what* code does; only *why*, when non-obvious.
- Don't add abstractions, error handling, or config the current task doesn't need.

Read [`docs/conventions.md`](docs/conventions.md) for the full detail behind these.

## Working in this repo

- `apps/web` — frontend. `pnpm dev:web` from the repo root.
- `apps/server` — backend. `pnpm dev:server` from the repo root.
- The design files under `design/` are reference-only prototypes (see design-handoff.md) — never
  port their inline-style/runtime scaffolding directly.
