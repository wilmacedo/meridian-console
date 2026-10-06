# Meridian Console

Control plane for a self-hosted homelab: fleet overview, per-service drill-down, a live
packet/log console, Home Assistant control, reverse-proxy route management, and scheduled
automations. Built to run on a headless Debian box and be viewed from any device on the network,
including a permanently-mounted touch panel.

## Stack

- `apps/web` — Svelte + Vite + TypeScript frontend.
- `apps/server` — Fastify + TypeScript backend: discovers services and mounts their routes.
- `packages/service-sdk` — the contract between the core and a service.
- `services/*` — the services themselves.

See [`docs/architecture.md`](docs/architecture.md) for the why, and
[`docs/design-handoff.md`](docs/design-handoff.md) for the full visual/behavioural spec.

## Services

Everything the dashboard shows is a **service**: a folder under `services/` that is discovered
automatically, with its own server routes, status and optional UI. Today: `aqw-idle` (a packet
console) and `tuya-feeder` (a Tuya pet feeder with a camera, on the Habitat screen). See
[`docs/services.md`](docs/services.md) to write one. Credentials and per-installation values go in
`.env` (see `.env.example`).

## Getting started

```sh
pnpm install
pnpm dev:web      # http://localhost:5173
pnpm dev:server   # http://localhost:4000
```

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it links to the language, naming, and commit conventions
that apply to every change in this repo.

## License

[Apache License 2.0](LICENSE).
