# Meridian Console

Control plane for a self-hosted homelab, built around **NOX**, a voice-driven agent. One screen: a
generative core with windows (services, telemetry, events, cameras, generated documents) and dock
widgets in front of it. Built to run on a headless Debian box and be viewed from a browser on the
network.

## Stack

- `apps/web` — Svelte + Vite + TypeScript frontend.
- `apps/server` — Fastify + TypeScript backend: discovers services and mounts their routes.
- `packages/service-sdk` — the contract between the core and a service.
- `services/*` — the services themselves.

See [`docs/architecture.md`](docs/architecture.md) for the why, and
[`docs/design-handoff.md`](docs/design-handoff.md) for the full visual/behavioural spec.

## Services

Everything Meridian shows is a **service**: a folder under `services/` that is discovered
automatically, with its own server routes, status, actions, events and optional windows and widgets.
Today: `aqw-idle` (a packet console), `tuya-feeder` (a Tuya pet feeder with a camera) and `calendar` (Google
Calendar across several accounts). See
[`docs/services.md`](docs/services.md) to write one. Credentials and per-installation values go in
`.env` (see `.env.example`).

## Getting started

Node 24 (see `.nvmrc`; `nvm use`) and pnpm. There is no native module to compile: workspaces are stored
with Node's built-in `node:sqlite`, which still prints an `ExperimentalWarning` when the server starts.

```sh
pnpm install
pnpm dev:web      # http://localhost:5173
pnpm dev:server   # http://localhost:4000
pnpm nox "abre a telemetria"   # talk to NOX without a microphone (needs the server and `claude` logged in)
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it links to the language, naming, and commit conventions
that apply to every change in this repo.

## License

[Apache License 2.0](LICENSE).
