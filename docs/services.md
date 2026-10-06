# Services

Everything the dashboard shows or controls is a **service**: a folder under `services/<id>/`. The core
(`apps/web`, `apps/server`) knows nothing about any specific service. Dropping a folder in is all it takes
for a service to show up in the Services list, the overview graph and, if it asks for it, on other screens.

The contract lives in `packages/service-sdk` (`@meridian/service-sdk`). It is types plus two identity
helpers, so a service depends on nothing else of ours.

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
  manifest: { id: 'my-service', name: 'my-service', kind: 'database', tag: 'SQL' },
  routes: async (app) => {
    app.get('/ping', async () => ({ ok: true }))
  },
  status: async () => ({ state: 'ok', facts: [{ label: 'VERSION', value: '16' }] }),
})
```

| Field | Meaning |
|---|---|
| `manifest.id` | Must equal the folder name. Becomes `/api/services/<id>` |
| `manifest.name`, `kind`, `tag` | Display name, free-form category chip, short badge in the list. Nothing branches on `kind` |
| `manifest.host` | Optional. Services sharing a host are grouped together; defaults to `local` |
| `routes` | Optional Fastify plugin, mounted under `/api/services/<id>`. WebSockets work the same way |
| `status()` | Optional. Returns `{ state: 'ok' \| 'warn' \| 'err', message?, facts? }`. Polled by the dashboard every 15s, so keep it cheap or cache it; it times out after 3s and then counts as `err` |

At startup the server reads `services/*/server/index.ts` and registers each one. A service that fails to
load (no default export, id different from its folder, not kebab-case, or it throws) is logged and
skipped; it never takes the server down. `GET /api/services` returns every manifest with its current
status, and it is the single source the whole UI renders from. Restart the server to pick up a new
service folder.

## Web side

```ts
import { defineWebService } from '@meridian/service-sdk/web'
import Panel from './panel.svelte'
import Widget from './widget.svelte'

export default defineWebService({ panel: Panel, habitat: [Widget] })
```

| Field | Meaning |
|---|---|
| `panel` | Full-page UI shown when the service is selected. It receives `{ service }` (manifest + status) and renders below the shell's breadcrumb (back to overview, switch service). Without one, the generic panel shows the manifest, status message and facts |
| `habitat` | Self-contained widgets (no props, they fetch their own data) listed on the Habitat screen, in order |

`services/*/web/index.ts` is picked up at build time (Vite `import.meta.glob`), so there is nothing to
register in the core. A service's UI talks to its own routes at `/api/services/<id>/...` and should import
nothing from `apps/web`.

## Adding a service

1. Create `services/<id>/` with the layout above (copy `services/aqw-idle` for the smallest example).
2. Run `pnpm install` so the workspace links the package.
3. Add its env vars to `.env.example` and document them in its README.
4. Restart the server. It shows up in the Services list and the overview graph.

Check it with `pnpm --filter @meridian/service-<id> typecheck`, or `pnpm typecheck` for everything.

## Keep personal data out

A service's code and docs are generic; what is specific to one installation (device IDs, hostnames, IPs,
readings) goes in `.env` or the git-ignored `docs/local/`. That is what lets a service be shared.

## Not covered yet

- Production: the server runs through `tsx` (also for `start`), because services are loaded from outside
  `apps/server`. Bundling comes with the run-permanently work.
- Per-service config beyond env vars, enabling/disabling a service from config, and ordering.
- More UI slots than `panel` and `habitat` (e.g. an overview tile). Add one when a second service needs it.
