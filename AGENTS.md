# AGENTS.md

Rules and reference docs for anyone — human or agent — working in this repository.

## Project

Meridian Console: a control plane for a self-hosted homelab (headless Debian box), built around
**NOX**, a voice-driven agent (Meridian is the project, NOX the assistant). Frontend in
Svelte + Vite + TypeScript, backend in Fastify + TypeScript, pnpm workspaces. Full context:

- [`docs/architecture.md`](docs/architecture.md) — stack and why, layout, data flow, NOX.
- [`docs/design-handoff.md`](docs/design-handoff.md) — the visual/behavioural source of truth
  (tokens, palettes, layout, components, animations, window/dock/pin rules). Match it in fidelity;
  see its "About the design file" section for how to adapt the reference HTML to Svelte.
- [`docs/services.md`](docs/services.md) — the service contract: how to add a service (a folder under `services/`) and what the core guarantees.
- [`services/tuya-feeder/README.md`](services/tuya-feeder/README.md) — Tuya/SmartLife notes (feeder DPs, API pitfalls, open questions).
- [`docs/conventions.md`](docs/conventions.md) — language, file naming, commit, and PR rules.

## Non-negotiables (summary)

- English only: code, comments, commits, PRs, docs. The one exception is user-facing UI labels, which may be Portuguese.
- File names in `kebab-case`.
- Commits are Conventional Commits, one responsibility per commit.
- No comments explaining *what* code does; only *why*, when non-obvious.
- Don't add abstractions, error handling, or config the current task doesn't need.

Read [`docs/conventions.md`](docs/conventions.md) for the full detail behind these.

## Working in this repo

- `apps/web` — frontend. `pnpm dev:web` from the repo root.
- `apps/server` — backend. `pnpm dev:server` from the repo root.
- `services/<id>` — one folder per service, auto-discovered; the core never names a service.
- `pnpm typecheck` covers every package, including each service.
- Prod runs 24/7 from a separate worktree and redeploys itself on every commit to `main` ([`docs/deploy.md`](docs/deploy.md)). It owns port 4000: a dev or test server must use its own (`PORT=4100 pnpm dev:server`, `MERIDIAN_API_PORT=4100 pnpm dev:web`), never stop or restart prod by hand, and commits to `main` go live, so commit there only finished work.
- The new design is the source of truth and the code adapts to it, never the reverse. Nothing of the
  previous design (its tokens, screens, components) is reused.
- `design/nix/` holds the reference prototype (`NIX v6.dc.html` is the one that counts; earlier
  versions are history). It is git-ignored and exists only on the author's machine, so the handoff doc
  is the spec to follow; never port the prototype's inline-style/runtime scaffolding directly. The
  prototype's assistant is called NIX; in this project it is **NOX**.
- Don't port the prototype's dead state (subtitles: `hasSub`/`subText`; text input: `showInput`);
  the UI has neither subtitles nor a text input to talk to NOX (the one field is the name of a new workspace).
