# Services

Everything Meridian shows or controls comes from a **service**: a folder under `services/<id>/`. The core
(`apps/web`, `apps/server`) knows nothing about any specific service. Dropping a folder in is all it takes
for a service to show up in the Services window, the event stream and, if it asks for it, as windows and
dock widgets.

The contract lives in `packages/service-sdk` (`@meridian/service-sdk`). It is types plus identity helpers,
so a service depends on nothing else of ours. What the Services window card renders defines what a
service must provide, see [`design-handoff.md`](design-handoff.md#services).

## Layout

```
services/<id>/
├── package.json          @meridian/service-<id>, depends on @meridian/service-sdk (workspace:*)
├── tsconfig.json         extends ../../packages/service-sdk/tsconfig.service.json
├── server/index.ts       default export: defineServerService({ ... })
├── web/index.ts          optional, default export: defineWebService({ ... })
├── scripts/              optional CLI helpers
├── compose.yaml          optional, anything the service needs running next to the server
└── README.md             what it does, its env vars, its findings
```

The folder name is the service id: kebab-case, unique, and also the API prefix. A folder without
`server/index.ts` is ignored.

## Server side

```ts
import { defineServerService } from '@meridian/service-sdk/server'

export default defineServerService({
  manifest: { id: 'my-service', name: 'my-service', desc: 'What it does, in a line', runtime: 'docker', address: 'localhost:9000' },
  routes: async (app) => {
    app.get('/ping', async () => ({ ok: true }))
  },
  status: async () => ({ state: 'online' }),
  actions: [
    { id: 'restart', method: 'POST', path: '/restart', title: 'Restart', description: 'Restarts the worker', mutating: true, run: async () => restart() },
  ],
  events: (emit) => {
    const timer = setInterval(() => emit('info', 'heartbeat'), 60_000)
    return () => clearInterval(timer)
  },
})
```

| Field | Meaning |
|---|---|
| `manifest.id` | Must equal the folder name. Becomes `/api/services/<id>` |
| `manifest.name`, `desc` | Name and one-line description on the card |
| `manifest.mono` | Two-letter badge on the card; derived from the name when absent |
| `manifest.runtime`, `address` | Shown on the card (for example `docker`, `10.0.0.12:7310`) |
| `manifest.container` | Docker container name. The card then shows its uptime, and the Telemetry window its CPU and memory |
| `manifest.url` | Adds an `OPEN ↗` link to the card |
| `routes` | Optional Fastify plugin, mounted under `/api/services/<id>`. WebSockets work the same way |
| `status()` | Optional. Returns `{ state: 'online' \| 'degraded' \| 'offline', message? }`. Polled every 10s; keep it cheap or cache it. It times out after 3s and then counts as `offline`. Every change of state is written to the event stream |
| `actions` | Typed operations. Each is listed on the card (`method`, `path`) and run through `POST /api/services/<id>/actions/<action id>`, with `input` (a JSON Schema) validated by the core. The same list is NOX's tool set. `mutating` marks the ones that change the world. A run is logged as an event with its status and latency. The card's `RUN` button only enables actions that take no input |
| `events` | Optional. Called once at startup with `emit(level, message)`; returns the function that stops it. Events land in the single stream the Events window and widget read |

At startup the server reads `services/*/server/index.ts` and registers each one. A service that fails to
load (no default export, id different from its folder, not kebab-case, or it throws) is logged and
skipped; it never takes the server down. Restart the server to pick up a new service folder.

The core also serves what a screen needs live: `GET /api/services`, `GET /api/events`, and the WebSocket
`/api/stream`, which carries a snapshot on connect and then events, status changes and host telemetry
(see [`architecture.md`](architecture.md#data-flow)).

## Web side

```ts
import { defineWebService } from '@meridian/service-sdk/web'
import Cameras from './cameras.svelte'
import Widget from './widget.svelte'
import Console from './console.svelte'

export default defineWebService({
  windows: [
    { id: 'cameras', module: 'cameras', title: 'Cameras', kicker: 'Feeds', pin: 'feeder', footer: '1 FEED', component: Cameras },
    { id: 'console', title: 'Console', kicker: 'Live stream', component: Console },
  ],
  widgets: [{ type: 'feeder', title: 'Feeder', kicker: 'AUTOMATION · LIVE', component: Widget }],
})
```

| Field | Meaning |
|---|---|
| `windows[].module` | `'cameras'`: the body is shown inside the Cameras module window, the one the dock's Cameras button opens. Several services can contribute; their bodies stack |
| `windows[]` without `module` | The service's own window. The service's card gets a button with the window's title that opens it, and NOX can open it too |
| `windows[].pin` | The `type` of the widget this window's PIN button docks |
| `windows[].footer` | Left side of the window footer |
| `widgets[]` | A dock widget. `type` is stable so a workspace can persist and recreate it; system widgets are unique per `type` |

Components take no props: they fetch their own data from `/api/services/<id>/...` and import nothing from
`apps/web`. Style them with the design tokens (`--nx-*` CSS variables, `docs/design-handoff.md`); put
a surface that must stay dark in light mode (video) under the `nx-dark` class.

`services/*/web/index.ts` is picked up at build time (Vite `import.meta.glob`), so there is nothing to
register in the core.

## Adding a service

1. Create `services/<id>/` with the layout above (copy `services/aqw-idle` for the smallest example).
2. Run `pnpm install` so the workspace links the package.
3. Add its env vars to `.env.example` and document them in its README.
4. Restart the server. It shows up in the Services window.

Check it with `pnpm --filter @meridian/service-<id> typecheck`, or `pnpm typecheck` for everything.

## Managed services: added without code

A service does not have to be a folder. NOX can add, change and remove **managed** services while the
server runs, which is how something already running on the machine (a Docker container) gets under
Meridian without writing code or restarting anything. A managed service is a record in the server's
SQLite database (`managed_services`), not a file in the repository, so it also stays out of version control.

| Field | Meaning |
|---|---|
| `id`, `name`, `desc` | As in the manifest. `desc` may be empty |
| `container` | A Docker container name. The service is `online` while it runs, `degraded` while Docker reports it unhealthy, `offline` otherwise (or when the container does not exist) |
| `healthUrl` | An `http(s)` URL fetched on each status check; any answer below 500 counts as up. With a container, a failing URL makes it `degraded`; on its own, `offline` |
| `url`, `address`, `runtime`, `mono` | Shown on the card; `runtime` defaults to `docker` for a container |

A managed service with a `container` gets actions: `details` and `logs` (read-only) and `start`, `stop`
and `restart` (`mutating`: when NOX runs them the owner confirms on the screen). Without a container it has
no actions, only a status. It is listed in `GET /api/services` with `managed: true`, its actions run through
the same `POST /api/services/<id>/actions/<action>`, and it survives a restart.

NOX's tools for it: `list_containers`, `add_service`, `edit_service`, `remove_service`,
`describe_service` and `call_service_action` (which runs any action by name, including those of services
added after NOX started: its per-action `service_*` tools are fixed when the process starts). Adding,
editing and removing do not ask for confirmation, because they only change what Meridian shows, never the
container; services made of code cannot be changed from there. For anything beyond this (custom routes,
windows, widgets, a protocol of its own) a service is still a folder with code, as above.

## Keep personal data out

A service's code and docs are generic; what is specific to one installation (device IDs, hostnames, IPs,
readings) goes in `.env` or the git-ignored `docs/local/`. That is what lets a service be shared.

## Not covered yet

- Production: the server runs through `tsx` (also for `start`), because services are loaded from outside
  `apps/server`. Bundling comes with the run-permanently work.
- A managed service cannot contribute windows or widgets; that needs a code service.
- Actions with input from the card: only NOX can call them for now.
