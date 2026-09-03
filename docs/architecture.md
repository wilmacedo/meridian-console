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
├── web/       Svelte + Vite + TypeScript frontend. Built to static assets, served by the server
│               in production (or by Vite's dev server locally).
└── server/    Fastify + TypeScript backend. Bridges Docker/Podman, Prometheus, Home Assistant
                (REST + WS), and the Caddy admin API; exposes REST + WS/SSE endpoints; serves the
                built frontend in production.
```

Package manager: pnpm workspaces (`pnpm-workspace.yaml`), so `apps/web` and `apps/server` share
tooling without needing a separate monorepo tool.

## Data flow (target state)

| Source | Integration | Consumed by |
| --- | --- | --- |
| Docker/Podman | server, via socket (e.g. `dockerode`) | service registry, System Overview graph |
| Prometheus | server, HTTP query API | metric cards, sparklines |
| Home Assistant | server, REST + WebSocket | Habitat screen |
| Caddy admin API | server, HTTP | Endpoints screen |
| Service log/packet stream | server, tails the source, re-emits over WS/SSE | packet console |

The frontend never talks to these systems directly — it only talks to the Fastify backend, which
is the single trust boundary running on the homelab box.

## Conventions

File naming, commit, and language rules are in [`conventions.md`](conventions.md). The visual and
behavioural source of truth is [`design-handoff.md`](design-handoff.md) — implementation should
match it in fidelity, adapting only the technical scaffolding (see that doc's "About the Design
Files" section).
