# Handoff: Meridian Console — server + home automation control platform

> Source of truth for visuals and behaviour. Referenced from [`architecture.md`](architecture.md)
> and [`/AGENTS.md`](../AGENTS.md). The raw design files it points to live in [`/design`](../design).

## Overview

Meridian Console is a web control plane for a self-hosted (homelab) environment. One operator
("solo self-hoster") uses it to watch a fleet of containerised services, drill into any single
service, read a live packet/log console for a socket-based service (`aqw-idle`), control Home
Assistant devices, manage reverse-proxy routes, and arm scheduled automations.

The visual language is a "spacecraft console": near-black background, thin 1px panel borders,
teal primary + amber secondary, everything in a monospace face, ambient scanlines and a slow scan
sweep, live telemetry everywhere.

Two design files ship in this bundle:

| File | Direction | Status |
| --- | --- | --- |
| `design/meridian-console.dc.html` | Dark console / terminal aesthetic (teal + amber, monospace) | **Primary — build this one** |
| `design/orbital-control.dc.html` | Earlier direction: holographic glass + HUD brackets, Chakra Petch display face | Reference only / alternate visual |

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes that show the
intended look, layout, and behaviour. They are **not production code to copy directly**. All data
in them is fabricated and generated on timers; there is no backend.

Your task is to **recreate these designs in the target codebase's existing environment** (React,
Vue, Svelte, SwiftUI, whatever it uses) using its established patterns, component library, routing,
and data layer. If the project has no frontend yet, pick the framework that best fits the backend
and implement the designs there.

The HTML uses a small in-house component runtime (`<x-dc>`, `<sc-for>`, `<sc-if>`, a `Component`
class with a `renderVals()` method, inline styles only). Treat that as scaffolding:

- `<sc-for list={{ x }} as="item">` → a `.map()` / `v-for`
- `<sc-if value={{ flag }}>` → conditional render
- `renderVals()` → the render-time derivation of view state (in React: the body of the component
  before `return`, or a `useMemo`)
- Inline style strings built in `renderVals()` → your styling solution (CSS modules, Tailwind,
  styled-components). Do **not** carry the string-concatenated styles over literally.

To open a design file, just open it in a browser — no build step.

## Fidelity

**High-fidelity.** Colours, type sizes, spacing, borders, and motion timings in this document are
final and intended to be matched. Where the codebase already has a design system, prefer its
primitives, but keep the palette, the 1px-border panel language, the monospace type, and the
density.

---

## Information architecture

```
Header (logo · nav · clock · status LEDs)
│
├── System Overview          ← default screen
├── Services ▾               ← dropdown, NOT a screen. Lists every service grouped by host.
│    └── <service panel>     ← screen; which panel renders is driven by service.kind
│         ├── kind "packet"  → Packet console (aqw-idle)
│         └── all other kinds→ Generic service panel
├── Habitat                  ← home automation
├── Endpoints                ← reverse-proxy route table + inspector
└── Protocols                ← automations / schedule
```

The **service registry is the single source of truth**. Adding an entry to it must automatically:
1. add the service to the Services dropdown under its host group, and
2. add a node to the System Overview graph, connected to the hub, with no manual layout.

That auto-wiring is a hard requirement of the design, not an implementation detail.

### Service registry shape

```ts
type ServiceKind = "packet" | "hub" | "bus" | "db" | "proxy" | "metrics" | "media" | "sync" | "vpn";

interface Service {
  id: string;          // "aqw-idle"      — route param, stable key
  name: string;        // "aqw-idle"      — display
  image: string;       // "node:22-alpine"
  host: string;        // "orion-03"      — must match an infra node id
  uptime: string;      // "6d 14h"
  cpu: number;         // 18              — percent
  state: "ok" | "warn" | "err";
  kind: ServiceKind;   // selects which detail panel renders
  tag: string;         // "SOCKET"        — short badge in the dropdown/graph
}
```

Seed data used in the mock (9 services):

| id | image | host | uptime | cpu | state | kind | tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| aqw-idle | node:22-alpine | orion-03 | 6d 14h | 18 | ok | packet | SOCKET |
| home-assistant | ghcr.io/hass:2026.8 | atlas-01 | 41d 06h | 12 | ok | hub | 214 ENT |
| mosquitto | eclipse-mosquitto:2 | atlas-01 | 41d 06h | 3 | ok | bus | MQTT |
| postgres-16 | postgres:16-alpine | vega-02 | 28d 11h | 22 | ok | db | SQL |
| caddy-edge | caddy:2-alpine | vega-02 | 28d 11h | 7 | ok | proxy | INGRESS |
| prometheus | prom/prometheus:2.5 | vega-02 | 28d 11h | 15 | ok | metrics | TSDB |
| jellyfin | jellyfin:10.10 | orion-03 | 9d 02h | 48 | ok | media | MEDIA |
| syncthing | syncthing:1.29 | orion-03 | 3d 19h | 9 | warn | sync | PEER |
| wg-gateway | wireguard:latest | atlas-01 | 41d 06h | 2 | ok | vpn | TUNNEL |

Infra nodes (hosts + edge), with graph coordinates in an 820×420 space:

| id | name | x | y | kind | glyph |
| --- | --- | --- | --- | --- | --- |
| wan | wan-uplink | 150 | 72 | edge | globe |
| atlas-01 | atlas-01 | 296 | 142 | core | server |
| vega-02 | vega-02 | 206 | 252 | core | server |
| orion-03 | orion-03 | 178 | 358 | core | server |
| nas-vault | nas-vault | 306 | 322 | core | disk |

Infra links (pairs; `hub` = the central "main server" node at 500,210):
`wan→atlas-01`, `atlas-01→vega-02`, `vega-02→orion-03`, `vega-02→nas-vault`,
`atlas-01→hub`, `vega-02→hub`, `orion-03→hub`.

---

## Design tokens

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `bg/root` | `#050706` | page background |
| `bg/console` | gradient `180deg, rgba(10,18,16,.96) → rgba(6,10,9,.98)` | console shell |
| `bg/page-glow` | `radial-gradient(900px 620px at 50% 40%, #0b1210, #050706 70%)` | behind the shell |
| `bg/panel-solid` | `#080e0d` | dropdown, any opaque overlay |
| `bg/inset` | `rgba(4,8,7,.55….8)` | log surfaces, `<pre>` blocks |
| `accent/teal` | `#4fd6b8` | primary accent, healthy state, inbound |
| `accent/amber` | `#e07b28` | secondary accent, warnings, outbound, "now" marker |
| `state/err` | `#e0705f` | error level, failed state |
| `text/primary` | `#e6f4ef` | headings, key values |
| `text/body` | `rgba(196,220,212,.78)` | payload text, body |
| `text/muted` | `rgba(150,185,175,.45)` | labels, meta |
| `text/faint` | `rgba(160,196,187,.28)` | delimiters, disabled |
| `line/hairline` | `rgba(79,214,184,.14)` | default 1px panel border |
| `line/strong` | `rgba(79,214,184,.35)` | active/emphasised border |
| `line/row` | `rgba(79,214,184,.06)` | table row separators |

Teal and amber are exposed as tweakable props (`teal`, `amber`); everything else derives from them
with alpha suffixes (`${teal}22`, `${teal}55`, `${teal}77`). Preserve that relationship — themeing
should stay a two-colour change.

### Typography

- **Face**: `IBM Plex Mono`, weights 400/500/600/700. Everything, including numerals and headings.
  (The alternate `design/orbital-control.dc.html` pairs `Chakra Petch` display with IBM Plex Mono data.)
- **Scale** (size / weight / line-height / letter-spacing):

| Role | Spec |
| --- | --- |
| Wordmark | 15px / 700 / 1 / `.42em` |
| Screen title | 16–18px / 600 / 1.2 / `.10em` |
| Nav item | 10.5px / 500 / 1.6 / `.10em` |
| Panel header | 9px / 600 / 1 / `.20em`, uppercase |
| Section eyebrow | 7.5–8px / 600 / 1 / `.18em`, uppercase |
| Table header | 7.5–8px / 600 / 1 / `.18em`, uppercase |
| Body / row text | 10–11px / 500 / 1.3–1.7 / `.06em` |
| Log payload | 10px / 500 / 1.55 |
| Meta / key-value | 9px / 500 / 1.5–1.7 |
| Big readout (temp) | 34px / 600 / 1 |
| Metric value | 11–15px / 600 / 1 |

### Spacing, borders, motion

- Spacing scale: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 22 / 26 px. Page padding 26px; panel padding
  12–14px; header padding `16px 22px 12px`.
- **Border radius: 0 everywhere.** The only round shapes are status dots, infra graph nodes, and
  gauge dots. Service graph nodes are squares rotated 45° (diamonds).
- Borders are always 1px. Shadows are used only for glow (`0 0 8–12px <accent>`) and for the
  dropdown (`0 30px 70px -18px #000`).
- Transitions: `.15s` background, `.18–.2s` all-purpose control hover, `.5–1s ease` for bar/gauge
  value changes, `.2s cubic-bezier(.4,1.5,.5,1)` for toggle knob travel.
- Keyframes (all defined once, global):
  - `scan2` — 140px light band sweeping the shell top→bottom, 11s linear infinite
  - `orbit` — 90s linear rotation of the dashed orbit ring
  - `packet2` — a dot travelling an `offset-path` line, 3–4.6s linear infinite, fades in/out
  - `blinkdot` — 1.2–2.2s opacity 1→.2→1 for live LEDs
  - `flick2` — 2.4–4.4s opacity flicker for the glyph wall
  - `rise2` — 10px rise + fade, `.4s ease`, on every screen mount
- Scanline overlay: `repeating-linear-gradient(180deg, rgba(255,255,255,.02) 0 1px, transparent 1px 3px)`,
  `pointer-events:none`, above content.

---

## Shell / chrome (present on every screen)

- Page: `padding:26px`, radial glow background, `overflow-x:auto`.
- Console shell: `min-width:1420px`, 1px hairline border, gradient background, deep shadow,
  `overflow:hidden`, `position:relative`. Corner brackets 16×16px at top-left and bottom-right
  (1px, `rgba(79,214,184,.5)`).
- **Header** (`z-index:30`, solid `#070c0b` background — required so the Services dropdown is not
  overpainted by the content below): wordmark, nav row, spacer, `HH:MM:SS UTC` clock (1s tick),
  three 5px LEDs (teal blinking / amber / grey).
- Hairline divider under the header: `linear-gradient(90deg, rgba(79,214,184,.32), rgba(79,214,184,.06) 60%, transparent)`, inset 22px.
- **Body grid**: `212px | 1fr | 236px`, `min-height:660px`. The centre column has 1px left/right
  borders at `rgba(79,214,184,.1)`.

### Left rail (static across screens)

1. **ANALYSIS badge** — amber solid block, `#120a04` text, 9px/700, `.22em`, with a live counter
   suffix; below it three hex-ish rows in `text/muted` (`112 - 9453 - 2592 - DE` etc.). Decorative
   telemetry; keep or replace with a real build/commit id.
2. **Container Info panel** — reflects the currently selected service: Service, Image, Status
   (`UP` teal / `DEGRADED` amber), Host, Uptime. Below it a small isometric block graphic
   (two 150×34 parallelograms, `rotateX(62deg) rotateZ(-42deg)`, amber) representing containers.
3. **Host panel** — IP row, three labelled bars (Memory / Storage / CPU, teal fill at 75% opacity),
   and a 22-bar micro histogram that animates on tick.

### Right rail (static across screens)

1. **Glyph wall** — 5 rows × 7 cells, each 26px wide: a 20px bordered box containing either an
   X-cross (active) or a horizontal-line hatch (idle), with a 3-digit code under it. Each cell has
   its own `flick2` duration/delay so the wall shimmers. Decorative system-activity indicator.
2. **Gauges** — three vertical meters: `SYSTEM POWER`, `STABILITY` (teal), `LOAD STATUS` (amber).
   Label + value right-aligned, a small triangle pointer, then a bordered column filled bottom-up
   with `linear-gradient(180deg, <c>cc, <c>55)` and a 9px/1px repeating dark ruling over it.
3. **Ladder + scale** — 11 dots down a 1px rule (the dot matching current STABILITY turns amber),
   and a `100 → 00` scale in 10s.

---

## Screen 1 — System Overview

**Purpose:** all systems at a glance; entry point into any service.

**Layout, top to bottom:**

1. **Range tabs**, centred: `1H 24H 3D 1W 1M 3M`. Selected = 1px teal border + `text/primary`;
   others borderless `rgba(160,196,187,.45)`. Default `3D`.
2. **Graph**, `width:100%`, `aspect-ratio: 820 / 420`. An absolutely-positioned SVG (`viewBox="0 0 820 420"`)
   for links, plus an absolutely-positioned HTML overlay for nodes and labels. **Node labels must be
   HTML, not SVG `<text>`** — they need to stay selectable/editable and to scale with the container.
   - Background rings, centred on the hub (500,210): `r=196` dotted (`1 9`), `r=150` solid, both
     `rgba(79,214,184,.13)`; plus `r=118` dashed `18 12` rotating via `orbit`.
   - **Links**: one `<line>` per link. Infra links 1.1px at 0.6 opacity; hub→service links 1px at
     0.35 opacity, coloured by service state. The `wan→atlas-01` link is amber.
   - **Travelling packets**: 4 dots on selected links, `offset-path: path('M x1 y1 L x2 y2')`,
     `packet2` animation with staggered duration/delay.
   - **Hub donut** at (500,210): `r=70` track `rgba(79,214,184,.1)` 26px wide; amber arc 26px wide
     sized to aggregate load; a thin 2px teal arc over it; inner disc `r=44` fill `#0c1512` with a
     `rgba(79,214,184,.35)` border. Centre label: 8px white square + `main server` 9px/600/.14em.
     The live load badge sits **below** the hub (`top:58%`, translate -50% 0): an upward triangle
     then a bordered box with `NN%` — it must be anchored to the hub, never to a fixed percentage,
     or it collides with generated nodes.
   - **Infra nodes**: 40px (core) / 34px (edge) circles, `background:#0b1311`, 1px accent border at
     40% alpha, `box-shadow: 0 0 0 4px rgba(5,7,6,.9), 0 0 22px -6px <accent>` (the first ring
     punches a hole in the links behind them). Glyphs are pure CSS: `server` = 12px hatch bar with a
     left rule; `disk` = 13×11 hatch; `globe` = 13px circle with an equator band. Clicking a host
     with services opens the Services dropdown pre-filtered to that host; hosts with none get
     `cursor:default` and no handler.
   - **Service nodes**: 30px squares rotated 45°, border/glow in state colour, selected one gets a
     filled `<accent>1f` background and full-alpha border. Label is counter-rotated `-45deg` and
     placed below. Click → that service's panel.
   - **Auto-layout** (the important part):
     ```
     svcLayout(i):
       ring   = floor(i / 6)
       k      = i % 6
       r      = 152 + ring * 54
       spread = 156 - ring * 46          // degrees
       a      = ((k / 5) - 0.5) * spread * π/180
       x      = 500 + cos(a) * r * 0.92
       y      = 210 + sin(a) * r
     ```
     Six services per ring, fanned to the right of the hub. Keep every computed `y` inside
     ~24…396 of the 420 space; if you raise the per-ring count, re-tune `r`/`spread` and re-check.
3. **Wave panel**, 150px tall, sitting directly under the graph (`margin-top:-6px`): four
   polylines over the same 820-wide space — a filled area (`rgba(47,158,134,.28)`) + its teal
   stroke, an amber line, and a dashed teal line, each phase-shifted. Six amber spike bars at fixed
   left percentages animate height on tick. A vertical amber cursor at 50% carries: a value readout
   above (`14,208 MB/S`), a 4-line hex block, and an 18px `RM` marker box at the baseline.
4. **Axis row**: `00 20 40 … 200`, 8.5px muted, above a 1px top border.

---

## Screen 2 — Services dropdown (overlay, not a route)

Anchored under the nav item: `position:absolute; top:30px; left:120px; width:330px; z-index:40`,
1px `rgba(79,214,184,.35)` border, **solid `#080e0d` background** (never translucent — it sat over
the graph and was unreadable), `box-shadow: 0 30px 70px -18px #000`.

- Header row: `N SERVICES` eyebrow, a right-aligned borderless filter input (`filter…`), and an
  `✕` close.
- Body `max-height:330px; overflow-y:auto`, grouped by host. Group header: `rgba(79,214,184,.05)`
  band with the host name at 7.5px/600/.20em.
- Row grid `9px | 1fr | 62px | 40px`, padding `8px 12px`, 1px bottom rule: status dot (7px, glow),
  service name (600 when selected), tag in state colour right-aligned, CPU% muted right-aligned.
  Selected row background `rgba(79,214,184,.1)`; hover `.15s` background.
- **Clicking the nav item only toggles the dropdown — it must not navigate.** Navigation happens
  when a row is picked. Filter matches name + kind + tag + host.

---

## Screen 3 — Service panel, generic (`kind ≠ "packet"`)

Header block (bottom 1px rule, `padding-bottom:14px`):
- Breadcrumb row: `◄ OVERVIEW` (muted, hover teal), `SWITCH SERVICE ▾` (1px teal border button,
  reopens the dropdown), and an amber-bordered chip with the uppercase `kind`.
- Title: service name 18px/600/.10em; sub-line `image · host · UP uptime` 9px muted.
- Right side actions: `RESTART` (teal outline), `REDEPLOY` (amber outline + `rgba(224,123,40,.1)` fill),
  `HALT` (neutral outline). All 8px/600/.16em, `padding:8px 13px`, hover raises the fill.

Body:
1. **Three metric cards** (`repeat(3,1fr)`, gap 14): label eyebrow + big value on one baseline, then
   a 42px sparkline (`viewBox="0 0 200 42"`, `preserveAspectRatio="none"`) with a filled area
   `rgba(47,158,134,.22)` under a 1.2px teal stroke. Metrics: CPU %, MEMORY, EVENT BUS /s.
2. **Log stream** (`1.7fr`) — header with `LOG STREAM`, a blinking teal dot, `FOLLOW` on the right;
   250px body, bottom-anchored (`justify-content:flex-end`), each line `+SS.MS  LVL  message`,
   10px mono, level coloured (INFO teal-ish, WARN amber, ERR `#e0705f`), each new line animates in
   with `rise2`.
3. **Container facts** (`1fr`) — key/value rows with 1px separators: IMAGE, HOST, RESTART, PORTS,
   VOLUMES, LAST DEPLOY.

When you wire this up, `kind` is the extension point: add a case for `db` (connections, slow
queries), `proxy` (upstreams), `media` (transcodes) as needed. Everything else stays shared.

---

## Screen 4 — Service panel, packet console (`kind === "packet"`, i.e. `aqw-idle`)

This is the screen the user specifically asked for: a **SmartFoxServer-style packet/console stream**
where the wire codes are visible but legible.

Header: same breadcrumb row, then service name + a `SOCKET OPEN` chip, and a sub-line
`console stream · smartfox packet bus · N msg/s · N buffered`. Right side: `DECODE %XX`, `FOLLOW`
(with a pulsing amber dot), `CLEAR`.

**Filter bar** (single row, wraps):
- Search field, `flex:1`, 1px teal border, a `/` prefix glyph, placeholder
  `filter decoded text · e.g. getDrop, restart, hp`, and a right-aligned `N MATCH` counter.
  Matching runs against the **decoded** text, not the raw string.
- Level chips: `PKT` (teal), `INFO` (neutral), `WARN` (amber), `ERR` (red), `DROP` (faint), each
  with a live count. Toggling filters that level out; off state loses its fill and dims.
- 1px divider, then channel chips: `zone`, `server`, `runtime` (registry values `zm`, `srv`, `sys`).

**Log table**: grid `52px | 78px | 46px | 34px | 1fr` (SEQ / TIME / LVL / DIR / PAYLOAD), 392px
scroll body, alternating row tint `rgba(255,255,255,.012)`, selected row `rgba(79,214,184,.09)`.
- SEQ muted, TIME `HH:MM:SS.SS`, LVL as a 1px chip in the level colour, DIR as `IN` (teal) /
  `OUT` (amber) / `··` (faint).
- PAYLOAD is **tokenised**, rendered as a wrapping flex row of spans (flex, so no stray whitespace
  between tokens):

| Token kind | Rule | Style |
| --- | --- | --- |
| `esc` | a `%XX` pair in the escape table | amber; **decoded mode** shows the real character with a dashed amber underline at 10px; **raw mode** shows `%20` at 8.5px on an `rgba(224,123,40,.16)` chip |
| `sep` | a bare `%` delimiter | `rgba(160,196,187,.28)` |
| `proto` | the literal `xt` | teal chip: `background <teal>22`, border `<teal>55`, `.08em` |
| `cmd` | segment in the known-command list | `#e6f4ef`, 600 |
| `num` | `/^-?\d+$/` | amber |
| `word` | anything else | `rgba(196,220,212,.78)` |

  Escape table: `%20␣ %7C| %2C, %3A: %5B[ %5D] %22" %2F/ %25% %7B{ %7D} %3D= %26& %23#`.
  Known commands: `addGoldExp getDrop aggroMon questRewards cmd moderator mtls gar stu tfer uotls respawnMon`.

  Scanner (left-to-right, no regex on the whole string — a naive `split("%")` tears `%20` apart):
  ```
  i = 0
  while i < raw.length:
    three = raw.slice(i, i+3).toUpperCase()
    if ESC[three]:            push {kind:"esc", text:three, dec:ESC[three]}; i += 3; continue
    if raw[i] === "%":        push {kind:"sep", text:"%"};                   i += 1; continue
    j = next index of "%" (or end)
    text = raw.slice(i, j) → classify as proto | cmd | num | word
    i = j
  ```
- Footer legend strip: one swatch per token kind with its name.

**Packet inspector** (right column, 254px, amber-bordered):
- `RAW` — the untouched wire string in a `<pre>`, teal-green on `rgba(4,8,7,.8)`.
- `DECODED` — fully unescaped string in a `<pre>`, amber-tinted panel.
- Facts: SEQ, TIME, CHANNEL, DIRECTION (inbound/outbound/local), BYTES, ESCAPES (count of `%XX`).
- **FIELDS** panel below: the payload split **only on `sep` tokens**, with `esc` tokens decoded
  inside each field, labelled `proto / scope / cmd / arg 1 / arg 2 …`. So
  `%xt%zm%getDrop%1%Blade%20of%20Awe%1%` yields `arg 2: Blade of Awe` — one field, spaces intact.

**Feed behaviour**: one message ≈ every 900ms while FOLLOW is on, cycling a fixture pool; buffer
capped at 160 entries, last 60 rendered. FOLLOW off freezes the buffer; CLEAR empties it. Sample
fixtures (level, dir, channel, raw):

```
PKT  IN   zm   %xt%zm%addGoldExp%1%1250%340%0%
PKT  IN   zm   %xt%zm%getDrop%1%Blade%20of%20Awe%1%
PKT  OUT  zm   %xt%zm%aggroMon%1%3%
INFO ··   sys  idle%20loop%20tick%20%23{n}%20%7C%20quests%205%2F5
WARN ··   sys  server%20lag%20detected%20%3A%20rtt%3A%20412ms
ERR  ··   sys  packet%20parse%20failed%3A%20unexpected%20token%20%5B
PKT  IN   srv  %xt%server%moderator%0%Server%20restart%20in%2010%20min%
PKT  IN   zm   %xt%zm%stu%1%%7B%22intAP%22%3A12%2C%22intSP%22%3A4%7D%
DROP ··   sys  dropped%201%20duplicate%20frame%20%23{n}
```

Real integration notes: swap the fixture timer for the actual socket/log tail (WebSocket or SSE);
keep the ring buffer and the "render only the tail" behaviour, or the DOM will grow unbounded.
If your codes differ (colour codes like `&c`, bracket tags like `[SYS]`, entity ids), extend the
scanner with additional token kinds rather than pre-processing the string — the raw form must stay
recoverable for the RAW pane.

---

## Screen 5 — Habitat (home automation)

- Room tabs (`Living Room`, `Studio`, `Rack Room`, `Exterior`) left; scene chips (`Focus`,
  `Balanced`, `Night Watch`, amber-bordered) right.
- Grid `1fr | 250px`.
- **Device list** — one bordered panel, one row per device:
  `toggle | name+entity | level bar (flex:1) | reading (64px, right) | state (78px, right)`.
  Toggle is 34×16px, 1px border, a 12px knob translating 16px with the spring easing; on-state adds
  a teal glow and tints the row `rgba(79,214,184,.035)`. Turning a device off zeroes its bar and
  shows `OFF / IDLE`.
- **Climate dial** — 170px, SVG ring (`r=82`, 12px stroke) filled with a teal→amber gradient,
  rotated 120°, plus a dotted inner ring; the temperature (`21°`, 34px) and `TARGET · HEAT` are an
  **HTML overlay centred over the SVG**, not SVG text. `–` / `+` buttons (40×34) clamp 13…29°C.
- **Sensor array** — key/value rows: TEMPERATURE (tracks the dial minus 0.6), HUMIDITY, CO₂,
  PRESENCE, LUX.

Device fixtures exist for all four rooms (6 devices each) in the source file.

## Screen 6 — Endpoints

- Grid `1fr | 262px`.
- **Route table** — header row with `ROUTE TABLE` and a `+ NEW` button; columns
  `56px VERB | 1.4fr PATH | 1fr UPSTREAM | 88px P95 | 78px AUTH`. VERB is a 1px chip coloured by
  method (GET teal, POST amber, other `#9ecfc1`). P95 shows a 36×12 sparkline before the number.
  Selected row `rgba(79,214,184,.07)`.
- **Inspector** (amber border) — path, then UPSTREAM / AUTH / P95 / RATE LIMIT / CALLS 24H /
  ERROR RATE, a JSON response `<pre>`, and `SEND TEST` / `ROTATE KEY` buttons.

Seven seeded routes (`/api/v1/telemetry`, `/hooks/deploy`, `/api/v1/entities`,
`/api/v1/scene/apply`, `/media/library`, `/api/v1/thermostat`, `/health`).

## Screen 7 — Protocols (automations)

- **24H FLIGHT PLAN** — 62px band with a left+bottom 1px axis; each automation is a 6px bar
  positioned `left = start/24`, `width = duration/24`, stacked 9px apart, glowing in teal or amber.
  A 1px amber "now" line sits at the current UTC time. Axis labels `00:00 … 24:00`.
- **Rule rows** — `toggle | name + LAST RUN | trigger → condition → action | state`. The three
  clause chips are amber (trigger), teal outline (condition), teal filled (action), separated by
  `→` glyphs. State reads `ARMED` (teal) or `STANDBY` (muted). Row border brightens on hover.

Five seeded rules: Dusk Protocol, Thermal Guard, Nightly Snapshot, Away Lockdown, Cert Watch.

---

## Interactions & behaviour summary

| Trigger | Result |
| --- | --- |
| Nav item (non-Services) | switch screen, close dropdown |
| Nav `Services ▾` | toggle dropdown only — **no navigation** |
| Dropdown row | select service + navigate + close |
| `SWITCH SERVICE ▾` | reopen dropdown from inside a service panel |
| `◄ OVERVIEW` | back to System Overview |
| Graph service node | open that service's panel |
| Graph host node (has services) | open dropdown filtered to that host |
| Range tab / room tab / scene chip | set selection (visual only in the mock) |
| Device toggle | flip device state, animate bar and knob |
| Automation toggle | ARMED ↔ STANDBY |
| Route row | load it into the inspector |
| Log row | load it into the packet inspector |
| `DECODE %XX` | swap escape rendering between decoded char and raw code |
| `FOLLOW` | start/stop the stream |
| `CLEAR` | empty the buffer |
| Level / channel chip | filter the stream |
| Search input | filter on decoded text |

**Timers in the mock** (replace with real subscriptions): 1200ms telemetry tick (series, gauges,
micro-bars), 1000ms clock, 900ms packet feed.

## State

```
screen        "overview" | "service" | "home" | "endpoints" | "automations"
svcId         string                     // selected service id → drives which panel renders
navOpen       boolean                    // Services dropdown
svcQ          string                     // dropdown filter
range         "1H"|"24H"|"3D"|"1W"|"1M"|"3M"
room, scene   string
temp          number                     // 13…29
devOn         Record<string, boolean>    // keyed `${room}${index}`, defaults from fixture
autoOn        Record<number, boolean>
routeIdx      number
feed          LogLine[]                  // ring buffer, cap 160
packetSel     number                     // selected line id
q             string                     // console search
lvlOff/chanOff Record<string, boolean>   // inverted filters (absent = visible)
decode        boolean                    // %XX decode toggle
follow        boolean
seq           number                     // monotonic packet counter
series/gauge/tick/clock                  // telemetry
```

Real data layer, once integrated: services + hosts from your orchestrator (Docker/Podman/systemd),
metrics from Prometheus, log/packet stream over WebSocket or SSE per service, Home Assistant via its
REST + WS API, routes from the Caddy admin API, automations from HA's config.

## Assets

None. Every graphic is CSS or inline SVG — glyphs, isometric container blocks, gauges, dials, and
the graph are all drawn in code. Only web fonts are external:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<!-- alternate direction additionally uses -->
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## Files

| File | What it is |
| --- | --- |
| `design/meridian-console.dc.html` | Primary design. All seven screens, all fixtures, all behaviour. |
| `design/orbital-control.dc.html` | Alternate visual direction (glass/HUD). Same IA minus the packet console. |
| `design/support.js` | Runtime for the `<x-dc>` prototype format. Needed only to open the files locally — **do not port it**. |

Open either file directly in a browser; keep `design/support.js` next to them.

## Known pitfalls (already hit in this design)

1. **Never put live values in SVG `<text>`** — node labels, dial readings, and ring percentages
   must be HTML overlays over the SVG, or they stop scaling and stop being editable.
2. **The Services nav toggle must not navigate**, or opening the list yanks you into a service.
3. **Overlay panels need an opaque background and a header stacking context above the content**
   (`header { z-index: 30; background: #070c0b }`), otherwise later siblings paint over them.
4. **Anchor the hub badge to the hub**, not to a fixed percentage — generated service nodes move.
5. **Tokenise the payload; never `split("%")`** — it destroys `%20` sequences.
6. Keep every generated node inside the graph viewBox when the service count grows; re-tune the
   ring radius/spread rather than letting nodes escape the panel.
