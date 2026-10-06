# Architecture

## Why this stack

Meridian Console is the control plane for a headless homelab Debian box: view fleet status, drill
into a single service, tail a live packet/log console, control Home Assistant devices, manage
reverse-proxy routes, and arm automations. It will eventually be the permanent screen on a
touch panel, accessed over the local network — the panel is just a browser pointed at this app, so
shipping an update never requires touching the panel itself.

That use case drove two choices:

- **Frontend: Svelte + Vite + TypeScript.** No virtual DOM, small compiled output, cheap runtime —
  the right trade-off for a client that may run on modest touch hardware. Everything in the
  [design handoff](design-handoff.md) (scanlines, gauges, sparklines, the service graph) is plain
  CSS and hand-drawn inline SVG, not a component library, so Svelte's lighter footprint costs
  nothing in capability. `svelte/motion` and `svelte/transition` cover future motion work
  natively, without adding a dependency.
- **Backend: Fastify + TypeScript.** A browser cannot reach the Docker socket, the Caddy admin
  API, or tail a log file directly — the backend bridges those. It also owns the WebSocket/SSE
  endpoints that push the live packet stream and telemetry ticks to the frontend.

No SSR, no file-based routing: the app has a fixed set of screens (see the design handoff's
Information Architecture), switched by client-side state exactly like the `screen` field in the
handoff's State section — a router would be unused weight.

## Layout

```
apps/
├── web/       Svelte + Vite + TypeScript frontend: the shell, the overview, and the generic panel.
│               Built to static assets, served by the server in production (or by Vite locally).
└── server/    Fastify + TypeScript backend: discovers services, mounts their routes and serves
                GET /api/services. Serves the built frontend in production.
packages/
└── service-sdk/   The contract between the core and a service (types + defineServerService /
                   defineWebService).
services/
└── <id>/      One folder per service: server routes and status, optional web UI, scripts, docs.
```

The core is generic: it never mentions a specific service. Each service is self-contained and
auto-discovered, so adding one is adding a folder. The contract and how to write a service are in
[`services.md`](services.md).

Package manager: pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `services/*`), so
everything shares tooling without needing a separate monorepo tool.

## Data flow

A service's server code is the only thing that talks to its backend (Tuya cloud, a game's packet source,
Docker, ...). The frontend never does: it reads `GET /api/services` for the list and each service's own
routes under `/api/services/<id>/...`. The Fastify server is the single trust boundary running on the
homelab box.

Services that exist today:

| Service | Backend it bridges | UI |
| --- | --- | --- |
| `aqw-idle` | a packet source's SSE stream, relayed over WebSocket | packet console panel |
| `tuya-feeder` | Tuya Cloud OpenAPI, plus go2rtc for the camera | Habitat widgets (camera, feeder control) |

Sources named in the design handoff (Docker/Podman, Prometheus, Home Assistant, Caddy) are future services.

## Conventions

File naming, commit, and language rules are in [`conventions.md`](conventions.md). The visual and
behavioural source of truth is [`design-handoff.md`](design-handoff.md) — implementation should
match it in fidelity, adapting only the technical scaffolding (see that doc's "About the Design
Files" section).
