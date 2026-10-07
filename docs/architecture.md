# Architecture

Meridian Console is the control plane for a self-hosted homelab (a headless Debian box). Its single
surface is an **agent-first screen**: a generative core, windows and dock widgets in front of it, and
**NOX**, a voice-driven agent that operates the interface, the services and the owner's machines.
What the screen looks like and how it behaves is specified in [`design-handoff.md`](design-handoff.md);
this document covers the stack, the structure and how data moves.

Naming: **Meridian** is the project (packages are `@meridian/*`). **NOX** is the assistant inside it:
the voice, the orb, the author of generated documents, the wake word.

## Stack and why

- **Frontend: Svelte 5 + Vite + TypeScript, on the web.** The design is HTML/CSS: backdrop blur, masks,
  gradients, a canvas. A browser renders all of it as drawn, so the implementation can follow the design
  file closely. Native toolkits (Flutter, React Native) would mean redrawing every visual by hand for no
  benefit to the screens it must run on, which are browsers (a desktop now; an Echo Show 10 and an
  Android tablet later). Chromium-based browsers support everything the design relies on
  (`backdrop-filter`, `mask-image`, Pointer Events, Web Audio, `getUserMedia` over HTTPS).
- **Why Svelte specifically**, given the design is motion-heavy and will get more motion:
  - its motion vocabulary maps straight onto the design's: `transition:` / `in:` / `out:` for window and
    widget enter and exit, `animate:flip` for dock reordering, `svelte/motion` (`Spring`, `Tween`) for
    continuous values such as the orb's energy or a progress bar, all without extra dependencies;
  - a small runtime and fine-grained updates matter on low-end hardware, where the orb, stacked blur
    layers and live data compete for the GPU and CPU;
  - React was weighed (Motion gives excellent layout and exit animation, and the prototype is
    React-shaped), but its strengths are what Svelte's transitions and `animate:flip` already cover,
    and the prototype's code is scaffolding we would not reuse either way.
- **Backend: Fastify + TypeScript.** A browser cannot reach the Docker socket, a camera, the Tuya cloud
  or a packet source; the backend bridges them. It owns the realtime channels (WebSocket), the
  persistence, the agent, and it serves the built frontend in production.
- **Package manager:** pnpm workspaces (`apps/*`, `packages/*`, `services/*`).
- No SSR and no router: there is one surface; windows are state, not routes.

### How motion is implemented

1. **CSS keyframes** for the design's signature effects (`nxIn`, `nxSweep`, `nxEdge`, `nxClose`,
   `nxLift`, `nxJiggle`, …), ported with the names and timings from the handoff; they are
   compositor-friendly.
2. **Svelte transitions, `animate:flip` and `Spring`/`Tween`** for state-driven motion.
3. **Web Animations API** for imperative one-offs (the drag ghost's landing).
4. **GSAP** (free, including plugins) is reserved for choreographed sequences if they appear (a boot
   sequence, multi-element timelines). It is not installed until an animation needs it.

The **orb** is a framework-free module (`core-orb.ts`: canvas, `requestAnimationFrame`) driven by an
agent-state store. It is a Canvas 2D port of the prototype's renderer; a WebGL renderer is the
planned answer if a future low-end device cannot hold the frame rate. Expensive effects (orb, blur
layers) stay isolated so a quality setting can be added without touching components.

### Devices

Desktop browsers only, for now. The Echo Show 10 (Silk browser) and an Android tablet are planned but
not owned yet. They shaped the stack choice, and three habits keep them cheap later:

- voice input lights up by **feature detection** (microphone present and permitted); NOX is always
  reachable without one;
- positions and sizes are **fractional / relative** (windows are fractions of the stage), so other
  screen sizes need no data migration;
- fancy effects are isolated behind the orb renderer and blur layers.

Touch work the design doesn't cover (larger hit areas, pressed states instead of hover, double-tap,
audio unlock on first tap) waits for those devices.

## Layout

```
apps/
├── web/       Svelte + Vite frontend: theme, header, orb, bottom dock, window manager, docks,
│              widgets, doc renderer. Built to static assets and served by the server in production.
└── server/    Fastify backend: service registry, realtime channels, workspaces, event bus,
               host telemetry, the NOX bridge and Meridian's MCP server.
packages/
└── service-sdk/   The contract between the core and a service.
services/
└── <id>/      One folder per service: server routes, status, actions, events, optional windows
               and widgets, docs. Auto-discovered; the core never names a service.
```

Frontend internals worth knowing:

- **Window manager**: geometry is pure, unit-tested TypeScript (`window-layout.ts`: `tile`, `cascade`,
  `clampRect`, `snap` returning guides); a thin Svelte layer handles pointer input and animation. The
  design's drag/resize/snap/dock behaviour is ported rather than delegated to a library, because the
  libraries cover only the generic part (drag, resize) and none of the specific part (snapping to other
  windows' edges *and gaps*, tiling, guides, the ghost-with-tilt dock drag). Pointer plumbing lives in
  one small action (`use:pointerDrag`) that adds what the prototype lacks: `setPointerCapture`,
  `pointercancel`, ignoring a second touch, keyboard move/resize.
- **Doc renderer**: a block list (see the handoff's "Doc blocks") rendered at two scales, window and
  widget. NOX produces block lists; services can too.

## Services

A service is a folder under `services/` with a manifest, server code and optionally UI; the registry
is the single source of truth. The Services window card defines what the contract must carry: every
field it shows is something a service provides.

```ts
defineServerService({
  manifest: { id, name, mono?, desc, runtime?, address?, container?, url? },
  routes, status,                       // status → 'online' | 'degraded' | 'offline'
  actions: [{ id, method, path, title, description, input, mutating, run }],
  events: (emit) => () => {},           // start emitting, return stop
})
defineWebService({
  windows: [{ id, title, kicker, component }],
  widgets: [{ type, title, kicker, component }],
})
```

- `mono` (two letters) is derived from the name when absent.
- **Actions** are typed operations a service declares. One list feeds both the `RUN` buttons in the
  Services window and NOX's tools.
- **Events**: services `emit()` events (`info` / `warn` / `error`) into one core event stream, which is
  what the Events window, the `LOGS →` link and the Events dock widget read.
- A service can contribute **windows** (for example cameras and feeder automation, or a packet console)
  and **dock widgets**. Widgets carry a stable `type` so a workspace can persist and recreate them.
- **Docker is extra data, not the registry.** A host source (Docker socket and `/proc`) feeds the
  Telemetry window's container list; a service that names its container gets uptime, CPU and memory on
  its card.

The step-by-step guide to writing a service is [`services.md`](services.md); where it differs from the
above, the above is the target and `services.md` describes the contract as currently implemented.

### Core modules and installation facts

The bottom dock's modules (Core, Services, Telemetry, Events, Cameras) and their order come from the
design and live in code. There is no `nix.config.json`-style file:

- the host name in the header comes from the OS, overridable by an environment variable;
- uplink and other installation facts are environment variables, like the services' own settings;
- hiding or retiring a service or module is a **setting stored in SQLite**, changed from the settings
  menu or by asking NOX;
- cameras and automation schedules belong to the services that own them.

## Data flow

The server is authoritative and the single trust boundary. A service's server code is the only thing
that talks to its backend (Tuya, a packet source, Docker, …); the frontend never does.

```
screen(s) ── HTTP / WebSocket ──► Fastify ──► services ──► their backends
                                    │  ├── event bus (service events + NOX's own actions)
                                    │  ├── host telemetry (OS, Docker)
                                    │  ├── SQLite (workspaces, settings, …)
                                    │  └── NOX bridge ──► headless Claude Code ──► Meridian MCP server
                                    └── ElevenLabs proxy (STT, TTS)
```

- **Realtime**: a WebSocket carries the event stream, telemetry ticks and service state to every
  screen. The UI renders only real data.
- **Workspace state flows through the server**: a command given on one screen, or by NOX, mutates the
  workspace on the server, which broadcasts it to every screen showing that workspace. A command
  spoken on one screen therefore appears on all of them, and persistence comes for free.

### Persistence: workspaces and settings

Server-side **SQLite**, shared between screens. A workspace is a first-class entity from the start,
even though the UI to manage them comes later: a user has N workspaces, each with its own layout,
widgets and settings. Workspaces are purely visual and organisational (different monitors and devices,
different views); every screen showing a workspace sees the same state.

What a workspace stores: open windows with fractional rects, z-order and tiled/custom mode; rail
order; each widget's **definition** (`type`, `source: sys | agent`, params, collapsed); agent docs;
and its theme (mode and palette). It persists **specs, not rendered output**: a `feeder` widget is
stored as `{type:'feeder'}` and re-renders with live data; an agent doc as its block list; a *live*
agent widget as a binding (`action` + params + refresh interval + a block template) so it refreshes
after a reload instead of freezing.

- Table `workspaces (id, name, state JSON, version, updated_at)` in `meridian.db` (under
  `MERIDIAN_DATA_DIR`, default `~/.meridian`, WAL mode); one `default` row on first start. The server
  treats `state` as opaque JSON; its shape belongs to the web app (theme, windows, dock, document,
  retired services). Nothing may assume a single workspace.
- `GET /api/workspaces`, `POST /api/workspaces {name}`, `GET /api/workspaces/:id`,
  `PUT /api/workspaces/:id {version, state}` — the PUT carries the version it was based on; a stale one
  is rejected with `409` and the current workspace, so two screens can't silently overwrite each other.
  The client then adopts the server's state: the first writer wins.
- Change notification rides the existing `/api/stream` socket: a screen sends `{type:'watch', workspace}`
  and hears about that workspace only, on connect and on every accepted change, including ones made by
  the agent. A screen ignores versions it already holds, which is how it recognises its own writes.
- The client updates optimistically and sends the whole state, debounced (400 ms) so a drag is one write.
  Unchanged state is never sent.
- Which workspace a device opens is a per-device preference (local storage, set with
  `?workspace=<id>` on the URL), not workspace state; an unknown id falls back to `default`.
- SQLite is Node's built-in `node:sqlite` (Node 24, `.nvmrc`), so there is no native dependency to
  build. It is still marked experimental and prints a warning at start; only `database.ts` and
  `workspace-store.ts` touch it, so a change in its API stays contained there.
- NOX knows every workspace and which screens show each. By default it acts on the workspace of the
  screen that spoke to it, and can target another by name.
- Conversation history is **not** workspace state.

### Theme and settings

Default palette `mono`; light/dark switches by the clock (light 07:00–18:00), never by the OS
preference. A settings icon in the header opens a dropdown for mode and palette (details in the
handoff's "Additions"). Theme is stored per workspace, so NOX can change it too.

## NOX

NOX is a general-purpose, powerful agent, not a voice remote for the dashboard: it controls the
Meridian interface, talks to the owner's other services, and works on the owner's machines over SSH.
That rules out a locked-down tool list and makes **Claude Code itself** the engine, since it already is
a general agent (shell, files, MCP, subagents, skills, memory, background work).

### Engine: headless Claude Code on the subscription

The owner's constraint is no per-token API cost. `claude -p` (headless) runs on the **subscription
login** of the machine it runs on and supports token streaming (`--output-format stream-json
--include-partial-messages`), session resume (`--resume`), our tools (`--mcp-config`), lock-down
(`--allowedTools`, `--permission-mode dontAsk`), and system prompt control. Usage counts against the
plan's limits, shared with the owner's own Claude Code use. This is a personal tool on the owner's own
machine and login; it must never be exposed to other users.

Compared options: the Claude API with a small model (lowest latency, but per-token cost) and a local
model through Ollama (no cost, but PT-BR quality and tool calling on homelab hardware are doubtful).
Headless Claude Code is accepted even though latency may end up somewhat higher; the remaining work is
tuning it (time to first token and first spoken word, a slimmed system prompt versus the default, a
persistent process versus one process per turn, daily plan consumption).

#### Latency, measured

`apps/server/scripts/nox-latency.ts` (`pnpm --filter @meridian/server nox:latency`) runs ten typical
PT-BR voice requests through `claude -p` with `--output-format stream-json --include-partial-messages`
and reports, from the moment the prompt is sent: first event, first token, first complete sentence (what
TTS needs to start speaking) and total. Medians on Sonnet, October 2026, from one machine, one run each
(expect some variance), with a two-sentence answer style and no tools:

| Setup | First token | First sentence | Total | Context per turn |
|---|---|---|---|---|
| Default Claude Code, one process per turn (5 turns) | 6.6 s | 6.6 s | 6.6 s | ~45k tokens (cache reads) |
| Slim (own system prompt, no tools, no user settings), one process per turn | 2.3 s | 2.5 s | 3.3 s | ~0.5k tokens |
| Slim, **one persistent process** (`--input-format stream-json`), after the first turn | **0.9 s** | **1.2 s** | 1.8 s | grows ~0.15k per turn, cached |

What it means for the design:

- **Keep one persistent process.** Starting a process costs about 0.7 s before the first event and the
  first turn of a session about 2.3 s to the first token; every later turn pays only the model. This is
  why NOX runs as a long-lived process rather than one `claude -p` per request.
- **Slim the context.** Claude Code's default prompt, tools and the user's own settings cost ~45k tokens
  per turn and nearly 3x the latency. NOX's process uses its own system prompt, `--setting-sources` limited
  to NOX's home and only the tools it needs (Meridian's MCP server will add some tool definitions on top
  of the numbers above, kept cheap by prompt caching).
- **Sonnet, default effort.** In the same persistent setup Haiku was slower (2.0 s to the first token,
  and its short prompts were not cached) and `--effort low` made no clear difference (1.0 s). Not worth
  tuning until real traffic shows otherwise.
- **Plan usage.** Slim persistent turns are ~1k tokens of fresh input plus cached context, versus ~38k
  cache-read tokens per default turn, so a normal day of voice use is a small fraction of what the owner's
  own Claude Code sessions use. Re-measure once tools and the real persona are in.

Hermes Agent was considered (a self-hosted assistant with memory, skills and chat gateways) and set
aside: it needs its own model provider and can't run on the subscription, and everything needed from
it has an equivalent in Claude Code. Its good ideas are worth borrowing over time: memory that grows
from use, skills NOX writes for itself, scheduled and proactive tasks, reaching NOX outside the screen.

### Shape

- **One global NOX session** (not per workspace), a long-lived headless process run by the server and
  resumed across restarts. One conversation and one memory across all screens and workspaces.
- **A home directory** for NOX outside the repo (for example `~/.meridian/nox/`): its `CLAUDE.md` with
  persona, Brazilian-Portuguese voice rules (short spoken answers, technical terms kept in English), the
  machines and services it may touch and house rules, plus its own skills and memory, which NOX can
  update.
- **Meridian MCP server**, served by Fastify and passed with `--mcp-config`, is NOX's handle on the
  interface and the registry:
  - workspaces: `list_workspaces` (with the screens showing each), `open_window`, `close_window`,
    `arrange`, `pin_widget`, `clear_agent_widgets`, `set_theme`;
  - `compose_doc({title, kicker, blocks[]})`: the design's block language, validated server-side; live
    docs update by id;
  - every service **action** from the registry (feeder dispense, farm start/stop, …);
  - `get_status`, `query_events`, `get_telemetry`.
- **Reach beyond Meridian**: Bash (including `ssh` with the owner's own config and keys), other services
  through their MCP servers or HTTP APIs, web access.
- **Long tasks**: NOX answers by voice immediately and moves the work to the background (a subagent or
  background task); progress streams into a live doc.
- **Guard-rails**, since it runs unattended: allow rules for read-only work; risky actions (writes on
  other machines, `docker`/`systemctl` changes, deletes, mutating service actions that are not
  allow-listed) go through `--permission-prompt-tool`, an MCP tool on our server that shows a
  confirmation card on the screen that spoke and accepts a spoken "confirma" or a tap; everything NOX
  does is logged to the event stream under `nox`.

### Voice

Pipeline: microphone → STT → agent → TTS → speaker, with the orb fed by the real audio. There are no
subtitles and no text input in the UI by design; anything worth keeping on screen becomes a doc or a
widget. Before voice exists, a dev-only CLI (`pnpm nox "abre a telemetria"`) posts to the same entry
point voice will use.

- **ElevenLabs for both STT and TTS**, one vendor and one key, **proxied by our server** so the key
  never reaches the browser. TTS uses a multilingual low-latency model and a PT-BR voice, streamed
  sentence by sentence as the agent streams text, so speech starts before the answer is finished. The
  orb's amplitude comes from a Web Audio `AnalyserNode` on the real audio.
- **NOX speaks Brazilian Portuguese and understands English terms** (service names, `deploy`, `logs`,
  `container`, …): STT that handles PT/EN code-switching, a system prompt that keeps technical terms,
  ids and commands in their original form, and TTS pronunciation checked for those terms. UI labels stay
  in English, as designed.
- Interaction: push-to-talk first (mic button, `Space`), VAD for end of utterance, barge-in next,
  wake word ("NOX") last.
- **HTTPS on the LAN is a hard requirement**: browsers expose the microphone only in a secure context
  (`localhost` counts, `http://10.0.0.x` does not), so a local CA (Caddy) or a Tailscale certificate is
  needed.

## Security

There is **no auth**. Meridian is reachable only on the owner's LAN through Tailscale; that network is
the boundary, including for NOX's SSH reach. Auth is designed only when Meridian is exposed beyond it.
Because NOX can act on other machines, it runs with allow rules, UI approvals and full logging.

## Known risks

- **Performance on weak screens**: the orb redraws many points per frame with additive blending, plus
  stacked blurs. Fine on desktop; a quality setting and a WebGL orb are the answer for weaker devices.
- **Voice latency**: STT finalisation, the model's first token and TTS first audio stack up; streaming at
  every hop and speaking sentence by sentence is mandatory.
- **Costs**: ElevenLabs bills per character and Claude counts against plan limits. A usage counter goes
  into the event stream from the start; heavy background NOX tasks can eat into the plan.

## Conventions

File naming, commit and language rules are in [`conventions.md`](conventions.md). The visual and
behavioural source of truth is [`design-handoff.md`](design-handoff.md); implementation matches it in
fidelity and adapts only the technical scaffolding (see that doc's "About the design file").
