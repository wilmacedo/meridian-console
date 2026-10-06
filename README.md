# Meridian Console

Control plane for a self-hosted homelab: fleet overview, per-service drill-down, a live
packet/log console, Home Assistant control, reverse-proxy route management, and scheduled
automations. Built to run on a headless Debian box and be viewed from any device on the network,
including a permanently-mounted touch panel.

## Stack

- `apps/web` — Svelte + Vite + TypeScript frontend.
- `apps/server` — Fastify + TypeScript backend (bridges Docker, Prometheus, Home Assistant, Caddy;
  serves the WebSocket/SSE streams).

See [`docs/architecture.md`](docs/architecture.md) for the why, and
[`docs/design-handoff.md`](docs/design-handoff.md) for the full visual/behavioural spec.

## Home automation

Tuya/SmartLife devices (starting with the automatic pet feeder) are reached through the Tuya Cloud
OpenAPI. Notes in [`docs/tuya-feeder.md`](docs/tuya-feeder.md), scripts in
[`apps/server/scripts/tuya/`](apps/server/scripts/tuya/README.md). Credentials go in `.env` (see `.env.example`).

## Getting started

```sh
pnpm install
pnpm dev:web      # http://localhost:5173
pnpm dev:server   # http://localhost:4000
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it links to the language, naming, and commit conventions
that apply to every change in this repo.
