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
- `GET /api/workspaces` (in the order they were made; `?state=1` adds each one's state, for the switcher's
  thumbnails), `POST /api/workspaces {name}`, `GET /api/workspaces/:id`, `PATCH /api/workspaces/:id {name}`
  (rename; the id stays), `POST /api/workspaces/:id/duplicate {name?}`, `DELETE /api/workspaces/:id` (never
  the default one), `PUT /api/workspaces/:id {version, state}` — the PUT carries the version it was based on; a stale one
  is rejected with `409` and the current workspace, so two screens can't silently overwrite each other.
  The client then adopts the server's state: the first writer wins.
- Change notification rides the existing `/api/stream` socket: a screen sends `{type:'watch', workspace}`
  and hears about that workspace only, on connect and on every accepted change, including ones made by
  the agent. A screen ignores versions it already holds, which is how it recognises its own writes.
- The client updates optimistically and sends the whole state, debounced (400 ms) so a drag is one write.
  Unchanged state is never sent.
- The address decides which workspace a tab shows: `?workspace=<id>`, and `default` when there is none;
  nothing is remembered between tabs, so each monitor keeps its own with a bookmark. An id that does not
  exist yet is created (the server makes it once, whoever asks first). The `+` menu lists the workspaces
  and makes new ones by name (a taken name is refused with a 409); a new workspace starts with the
  default's theme.
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

### anywh

NOX drives [anywh](https://anywh.sh) (the owner's app for running coding agents on this machine) through
`apps/server/src/nox/anywh.ts`. Profiles are discovered from `~/.config/anywh` (`profiles.json` plus
`env/<id>.env` for the relay's host and port); each profile is its own relay, which has no auth of its
own (the tailnet is the boundary). Tools: `anywh_list_profiles`, `anywh_list_sessions` (`GET /sessions`),
`anywh_read_session` (WebSocket history replay, last 10 turns by default) and `anywh_send_message` (new
conversation or follow-up, over the same WebSocket). Session ids are checked against `/sessions` first,
because connecting to an unknown id would create it. Sending asks the owner to confirm only when NOX
marks the task `destructive`.

NOX is a wrapper around anywh, not a relay: it writes the message itself and does not wait. The server keeps
the WebSocket of the session open until the turn ends (30 minutes at most), then wakes NOX with a
`[anywhere update]` turn carrying the agent's last message (`announce` in `nox/routes.ts`: it queues behind
the owner's own turn and is spoken on the workspace's screens like any answer). NOX does the summarizing, so
no second model is involved. There is no anywh UI in Meridian yet.

### Engine: headless Claude Code on the subscription

The owner's constraint is no per-token API cost. `claude -p` (headless) runs on the **subscription
login** of the machine it runs on and supports token streaming (`--output-format stream-json
--include-partial-messages`), session resume (`--resume`), our tools (`--mcp-config`), lock-down
(`--allowedTools`, `--permission-mode`), and system prompt control. Usage counts against the
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

### As built (phase 6)

- **Process:** `apps/server/src/nox/process.ts` keeps one `claude -p` process alive (`--input-format
  stream-json`) for the current conversation, answering one request at a time, and resumes it across server
  restarts. `POST /api/nox/say {text, workspace?}` is the single
  entry point; the answer streams back as newline-delimited JSON (`text`, `tool`, `done`, `error`). Voice
  will post to it, and so does the dev CLI: `pnpm nox "abre a telemetria" [--workspace <id>]`.
- **Reach, enforced by flags** (and covered by a test, `buildArgs`): the Debian machine NOX runs on is
  **its own and its first place to work**. `--tools` gives it Bash, Read, Glob, Grep, Edit and Write for this
  machine and WebSearch and WebFetch for the web (nothing else built in), `--add-dir` opens the owner's whole
  home directory to the file tools, and `--permission-mode auto` hands every Bash call and file change to
  Claude Code's auto mode classifier. Only reading (and the web tools and the Meridian server) is allowed
  without a verdict; running and writing go through the classifier. It is told (`--settings`,
  `autoMode.environment`) that this machine is entirely NOX's to work on, including the repository and Docker,
  so looking around is not "scope escalation"; that `mac-lan` and `win-lan` are trusted but reached only with
  `ssh <host> <command>` and only when the owner named that machine in the conversation; that secrets
  (`.env`, keys, tokens, passwords) may be used by programs but never printed, read aloud, copied or sent;
  and that anything else on the network is out of scope. The system prompt also carries the machine's facts
  (`machineFacts`: host, user, home, where the repository, the services and the data are), so it does not
  hunt for its own project. The persona asks for `ssh -o BatchMode=yes -o ConnectTimeout=5 <host> ...` so an
  offline host fails fast. `--allowedTools` also lists the Meridian MCP server, `--strict-mcp-config` ignores
  every other server, and `--setting-sources ""` keeps the owner's own settings out. SSH uses the owner's
  existing config and keys. Mutating service actions go through the confirmation card (below), not the
  classifier. Background tasks get the same flags. Checked with the real `claude`: it found `aqw-idle` on
  this machine without being told where, answered uptime and disk locally, wrote a file, refused to show the
  `.env`, and went to the Mac only when the Mac was named. NOX is told never to restart or stop the server
  (it is the server's child); a code service it edits needs a restart that the owner does.
- **Confirmation cards:** Claude Code asks `--permission-prompt-tool mcp__gate__approve` for anything its
  mode doesn't settle. That tool lives on a second MCP server (`/mcp/gate`) that only the harness is
  pointed at, so NOX can never approve its own actions. `nox/approvals.ts` sends an `approval` message to
  the screen that spoke, which shows a card with the command; the owner taps CONFIRMAR / NEGAR, presses Esc
  (no), or says it: while a card waits, `/api/voice/ask` treats the transcript as the answer
  (`spokenAnswer`: "confirma", "sim", "não", "cancela"; anything unclear leaves the card open) instead of
  starting a turn. No screen, no answer in 60 s, or a dropped card is a no. Every decision is a `nox` event.
  Verified with the real `claude` in `default` mode (every Bash call prompts): tap, Esc and voice each
  worked end to end. In `auto` mode the classifier allowed every in-scope command we tried without
  prompting, so the card was never reached there; whether auto mode ever hands a case to the prompt tool
  is not confirmed yet.
- **Persona and notes:** the system prompt is `nox/persona.ts`; anything in `$NOX_HOME/CLAUDE.md`
  (default `~/.meridian/nox/`) is appended as the owner's notes. `NOX_MODEL` picks the model (Sonnet).
- **Meridian MCP server:** `POST /mcp`, a stateless JSON-RPC implementation of the tools part of MCP
  (`nox/mcp.ts`), served by the same Fastify process. Tools: `list_workspaces`, `open_window`,
  `close_window`, `close_all_windows`, `end_conversation`, `arrange_windows`, `pin_widget`, `clear_agent_widgets`,
  `set_theme`, `compose_doc` (validated server-side by `nox/doc-validation.ts`; an error message names the
  bad path so NOX can fix its call), `get_status`, `query_events`, `get_telemetry`, and one
  `service_<id>_<action>` per service action. Read-only ones run at once; ones marked `mutating` wait for the
  confirmation card (see below) and do nothing if the owner declines, whatever the permission mode.
- **Acting on a screen:** the server tracks which workspace each connected screen shows
  (`ScreenRegistry`). A UI tool sends a `command` message over `/api/stream` to **the screen that made the
  request** (every tab gives itself an id, sent with `watch` and with the voice request; with no id, as from
  the dev CLI, or when that tab is gone, it falls back to the newest screen of the workspace). The workspace
  is the one being talked in, unless the tool names another; that screen runs it
  with its own window manager and dock, and the resulting layout reaches the other screens through the
  workspace like any manual change. With no screen showing the workspace the tool fails and NOX says so.
  `pin_widget` only starts the pin: the pin card appears and the owner drops it on a rail.
- **State on the orb:** the server broadcasts the agent mode (`thinking` while the request runs,
  `speaking` while text streams, `idle` after). Until voice supplies a real audio level the orb uses a
  steady amplitude while speaking.
- **Logging:** every UI command and request is written to the event stream under `nox`, and so is every
  shell command NOX or one of its tasks runs (`ran: ssh ...`), read from the complete `tool_use` the
  Claude Code stream carries; card decisions and task start/finish are logged too.
- **Live documents:** `compose_doc` takes an optional `id`. Composing again with the id of the document on
  screen updates it where it is: no re-streaming, and the window is not reopened if the owner closed it.
  There is still one document slot per screen, so a task reporting progress replaces whatever document was
  open, and an update for an id that is no longer the current one opens as a new document.
- **Live widgets:** two kinds, both persisted with the workspace so they survive a reload.
  A doc widget docked from a live document (`docId`) follows that document: composing it again updates
  the widget, and if one is docked the document window is not pulled open. A *bound* widget
  (`pin_live_widget`) is a widget made by NOX from a read-only service action, its params, a refresh
  interval (5 s to 1 h) and a block template with `{{path}}` placeholders (`renderTemplate` in the SDK;
  a lone placeholder keeps its type, a missing path reads `—`, there are no repeated rows). The server
  refuses mutating actions, runs the action once to render the template through the doc validator, and
  offers the widget like any pin (the owner drops it on a rail). Each screen then polls the action's
  REST endpoint itself while the tab is visible, and dims the widget when the source stops answering.
- **Task indicator:** the stream's `tasks` message tells each screen which tasks are running for its
  workspace; the header shows a pulsing `● N TASK(S)` chip (amber, the thinking tint) that opens the
  newest task's document, fetched from `GET /api/docs/<id>` (the server keeps the latest version of every
  live document in memory). The orb does not change.
- **Web access:** NOX has `WebSearch` and `WebFetch` (Claude Code's own tools, on the subscription), next to
  Bash for ssh. The risk is a page that talks to the agent, so the auto mode classifier is told that web
  text is untrusted data that never justifies running a command, changing a service or reaching another
  machine, and the persona says the same. Checked with a page that told the assistant, in hidden text, to
  run a command and keep it secret: NOX summarised the page, reported the hidden request and ran nothing.
  `WebFetch` refuses `localhost` and forces HTTPS, so pages on the LAN are read through ssh instead.
  Anything that reaches the speech pipeline goes through `forSpeech`, which turns `[site](url)` into
  `site` and drops addresses and markdown marks, because a search result tends to bring a source list.
- **Acknowledging slow work:** the persona asks NOX to open with one short sentence ("Entendi, vou olhar os
  logs do baixa") before a slow tool, and the text before a tool call is spoken at once. When the model
  doesn't, the server does it: a turn that reaches a slow tool (Bash on a machine, `service_*`,
  `call_service_action`, `list_containers`, `add_service`, `edit_service`, `start_task`) without having said
  anything gets a short canned acknowledgement (`nox/acknowledge.ts`). Quick tools (windows, theme, local
  reads) get none. Turn numbers start from the clock, so a screen left open across a server restart does
  not mistake new speech for old and drop it.
- **Operating the owner's browser:** the `browser-harness` service (`services/browser-harness`) drives a Chrome the
  owner is already signed in to, for sites with no API (App Store Connect). NOX gets generic primitives
  (`snapshot`, `click`, `type`, `press`, `scroll`, `wait`, `back`, `tabs`, `open`, `read`) as ordinary `service_*`
  tools, and the policy sits in the gateway around them, not in the model: an allowlist of domains checked before
  and after every step, a risk classifier that makes the owner confirm on screen anything that could send, publish,
  delete, buy, accept or change something (through `gated` actions and `ctx.confirm`, see `services.md`), a seal
  only the server can make so the agent cannot confirm for itself, and an audit log. Cookies, storage, headers,
  passwords and typed text never come back or get logged. NOX is told, in its persona and to the auto mode
  classifier, never to reach that browser any other way; that is a guard-rail, not a boundary, since the debug port
  is open on loopback to any local process. It is brought up **on demand**: the first browser action opens an SSH
  tunnel and starts the owner's Chrome on its machine (a scheduled task with no trigger on Windows, so the window
  appears on their desktop), and the tunnel is dropped after a quiet spell; nothing runs on that machine on its own.
  Details and setup in the service's README.
- **Managing services:** NOX can add, edit and remove *managed* services (data, stored in SQLite, live
  without a restart) with `add_service` / `edit_service` / `remove_service`, find containers with
  `list_containers`, and run any action with `call_service_action`; see `services.md`. The registry mounts
  one shared action route for them, since Fastify takes no routes after it starts.
- **Background tasks:** `start_task({title, goal})` hands a long job to a worker (`nox/tasks.ts`): its own
  headless `claude` process with the same flags as NOX (Bash for ssh, the Meridian tools, the gate for
  confirmations, `start_task` denied so tasks can't spawn tasks) and a worker persona that reports through
  `report_progress` (its steps and their states, which the task card and the orb's ring show) and
  `compose_doc` with id `task-<id>` (its findings). A screen stops its workspace's tasks with
  `{type:'stop_tasks', id?}`, which is what the card's ✕ and the mic's halt send. NOX answers at once and stays free. The gate for a task lives at
  `/mcp/gate/<workspace>`, so its cards go to the workspace that asked. At most 2 run at once, 15 minutes
  each, and they use the owner's Claude subscription like any turn. A worker that fails, times out or is
  stopped (`stop_task`) replaces its document with the reason; one that finishes wrote its own outcome.
  A task's document appears on the tab that asked for it and its updates stay there (a live document
  stays on the screen it first appeared on). Tasks live in memory: a server restart ends them. NOX does not announce a finished task by itself.

### Link state, as built (phase 9)

`live.link` is `connecting` until the first attempt settles (so a loading page doesn't flash offline),
then `online` or `offline`. Offline shows the state label `OFFLINE` in red with its ticks unlit, a red
`● RECONNECTING` pill in the header, and a dimmed mic that does nothing. The socket reconnects with backoff
(1 s to 10 s) and at once when the browser comes back online or the tab becomes visible. A watchdog
treats 10 s without any message as a dead connection (the server writes a telemetry sample every second)
and lets go of the socket without waiting for a close handshake that a dead peer never answers; checked by
freezing the server process. Cards on screen are cleared when the link drops.

### Voice, as built (phase 7)

- **Output:** `voice/speaker.ts` cuts NOX's streaming text into sentences (`voice/sentences.ts`) and sends
  each to ElevenLabs TTS as soon as it is complete (`eleven_flash_v2_5`, Portuguese pinned, mp3 64 kbps).
  The mp3s go, in order, as `speech` messages (base64) over `/api/stream` to the screen that made the
  request (the newest of its workspace when it can't be told); nothing is spoken when no screen is showing it. The key never leaves the server.
  The screen decodes and chains the sentences with Web Audio and drives the orb from an `AnalyserNode` on
  what is actually playing (`agent.amplitude`). The agent mode follows reality: `thinking` until the first
  audio is ready, `speaking` while it plays, `idle` when the screen reports (`speech_done`) it finished, or
  after 90 s.
- **Input:** tap the mic button or the orb (tap again to send now, `Esc` to drop it); a pause of
  1.0 s after speech sends it by itself, and 7 s of silence or 30 s of talking ends it. The browser's
  `MediaRecorder` clip goes to `POST /api/voice/ask`, which transcribes it with ElevenLabs Scribe
  (`scribe_v2`, Portuguese) and answers like `/api/nox/say`; the first line of the stream is
  `{type:'heard', text}`. Scribe is given the service names as `keyterms`, because without them it hears
  "aqw-idle" as "Aquedol". Talking while NOX thinks or speaks interrupts it for real: the client aborts its request and sends
  `interrupt` on the socket; the server sends Claude Code a `control_request` interrupt (the persistent
  process survives and the next turn needs no restart), stops synthesising the rest of the answer, and
  denies the confirmation cards of that conversation (a background task's cards stay). The "error"
  Claude Code reports for an interrupted turn is turned into a normal end. Needs a secure context
  (HTTPS or localhost); without one the mic button is shown inert.
- **A message in the owner's own voice:** NOX's `record_voice_message` tool (for "manda um áudio pra
  Maria") sends the screen `capture_message` and arms the workspace for two minutes. The screen's next
  recording waits up to 10 s for speech and 3 s of pause before it ends, and is posted with `capture=1`;
  only when both agree (`voice/voice-messages.ts`) is the clip saved to `$MERIDIAN_DATA_DIR/recordings/`
  untranscribed, and NOX gets a `[voice message recorded]` turn with the path instead of a transcript, so
  what the owner said into the message is never taken as an instruction. NOX sends it like any file
  (WhatsApp's `send-voice` with `path`, behind its card). The file is deleted as soon as a service action
  that was given its path succeeds, two minutes after its turn otherwise, and anything older than ten
  minutes is swept. A recording without `capture=1`, or an interruption, disarms it; a recording with
  `capture=1` that nobody awaits any more is dropped with a 409, never transcribed. The screen retries a
  message whose upload the network dropped (three tries; not one the owner cut off), and plays the
  "unavailable" sound when it could not be delivered.
- **Wake word** (Settings → Voice, per workspace, off by default; never in CarPlay mode, see
  [`carplay.md`](carplay.md)): while the page is on screen the microphone stays open and
  `wake-listener.svelte.ts` feeds it, through an AudioWorklet that brings it to 16 kHz
  (`wake-capture-worklet.ts`), to a worker running openWakeWord's three ONNX models with
  `onnxruntime-web` (`wake-worker.ts`, `wake-pipeline.ts`, a port of the reference's streaming features). An energy
  gate (`wake-gate.ts`) runs the models only on chunks that stand out from the room, and two scores in a row above
  the threshold (higher while NOX speaks) wake it (`wake-trigger.ts`). Nothing leaves the device until then. The
  recording starts at once, from about 2 s of audio kept in memory, so the owner says the word and the request in
  one go; it ends like a tap's (the detector ignores the first 300 ms, the tail of the word), is encoded to Ogg Opus
  with WebCodecs (`clip-encoder.ts`, `ogg-opus.ts`; WAV without WebCodecs) and posted with `wake=1`. The server
  answers it only if the transcript has the wake word near the start, and passes on what follows it
  (`voice/wake-word.ts`); a transcript without it, or with nothing after it, is dropped. Every screen in earshot
  sends `wake` on the socket; the server lets the one with the best score answer (`wake_verdict`,
  `voice/wake-arbiter.ts`) and the others drop their recording without a sound. Over NOX thinking or speaking the
  wake word cuts it off like a tap, but leaves the background tasks running. The models live on the host, in
  `$MERIDIAN_WAKE_DIR` (default `$MERIDIAN_DATA_DIR/wake/`): `melspectrogram.onnx`, `embedding_model.onnx`,
  `wake.onnx` (the word's classifier) and `wake.json` (`{"phrase": "Ei NOX", "heard": ["ei nox", "nox"]}`, the
  phrase shown in the settings and how the transcript may write it). Without them the setting is locked. They are
  not in the repository: openWakeWord's ready-made models are not licensed for redistribution, and the word's own
  model is trained for this owner.
- **Audio autoplay:** browsers play audio only after a gesture, so the first click or key on the page
  unlocks the audio context; speech that arrives earlier waits for it.
- **Cost:** TTS bills per character; every spoken turn logs `voice: N of LIMIT characters used this period`
  to the event stream under `nox`. The free plan's 10,000 characters is only a few dozen answers.
- **Voices:** a voice from ElevenLabs' Voice Library (the native pt-BR ones) must first be added to the
  account's own library, and the API refuses it on the free plan (HTTP 402, "Free users cannot use
  library voices via the API"). On the free plan only the premade voices work, which speak Portuguese
  with an English accent.
- **Configuration:** `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` turn voice on; `ELEVENLABS_MODEL` and
  `ELEVENLABS_STT_MODEL` override the models. Without them the server runs text-only.
- **Measured:** from the end of a spoken request to the first sound, roughly 7 s with two tool calls
  (VAD wait 1.3 s, upload and transcription ~2 s, NOX ~3 s, TTS ~1 s); a text request with one tool call
  takes about 2.7 s. The silence window is now 1.0 s; realtime transcription is the next lever.

### Shape

- **One conversation per subject**, global (not per workspace): a long-lived headless process run by the
  server, resumed across restarts, shared by all screens and workspaces. NOX judges each request: the same
  subject carries on; a clearly different one makes it call `new_conversation`, and the server ends that
  turn and says the owner's words again in a fresh session, as one answer; when unsure it calls
  `offer_new_conversation` and asks, and a bare "sim" or "não" is taken by the server (`spokenAnswer`)
  without a model turn. A request after more than 10 minutes away carries how long it was, as a hint.
  `list_conversations` and `resume_conversation` take an earlier subject up again with all it remembers
  (`--resume`); one had before NOX's persona or settings changed is told so on return. The index (id,
  title, last use, fingerprint, current) is `conversations.json` in NOX's home. A spare process with an
  empty session waits, so a new conversation starts without the seconds a cold one takes. Nothing moves
  while a confirmation card or a message to record waits, nor in a turn NOX started itself.
- **A home directory** for NOX outside the repo (for example `~/.meridian/nox/`): its `CLAUDE.md` with
  persona, Brazilian-Portuguese voice rules (short spoken answers, technical terms kept in English), the
  machines and services it may touch and house rules, plus its own skills and memory, which NOX can
  update.
- **Meridian MCP server**, served by Fastify and passed with `--mcp-config`, is NOX's handle on the
  interface and the registry:
  - workspaces: `list_workspaces` (with the screens showing each), `open_window`, `close_window`,
    `arrange`, `pin_widget`, `clear_agent_widgets`, `set_theme`;
  - `compose_doc({id?, title, kicker, blocks[]})`: the design's block language, validated server-side; live
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
- Interaction: push-to-talk first (mic button), VAD for end of utterance, barge-in next,
  wake word ("NOX") last; the wake word runs in the browser, so no audio is streamed anywhere to listen for it.
- **HTTPS on the LAN is a hard requirement**: browsers expose the microphone only in a secure context
  (`localhost` counts, `http://10.0.0.x` does not), so a local CA (Caddy) or a Tailscale certificate is
  needed.

## Security

There is **no auth**, so the boundary is who can reach the port. The server (and the Vite dev server) listen
on **127.0.0.1 only**: NOX has a shell and file tools on this machine, and anything that can call
`/api/nox/say` can drive it, so nothing on the LAN may reach the port directly. The way in from another
device is `tailscale serve`, which connects from this machine, and only devices on the owner's tailnet can
reach that. Auth is designed only if Meridian is ever exposed beyond that. Because NOX can act on this
machine and others, it runs with the auto mode classifier, UI approvals for what changes services, and full
logging.

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
