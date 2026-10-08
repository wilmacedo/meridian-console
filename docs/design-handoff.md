# Design handoff: Meridian Console × NOX

> Source of truth for visuals and behaviour. Written from the Claude Design prototype
> `NIX v6.dc.html` (the latest of six iterations; it lives, git-ignored, under `design/nix/`).
> Referenced from [`architecture.md`](architecture.md) and [`/AGENTS.md`](../AGENTS.md).

## Overview

Meridian Console is a single agent-first surface, not a multi-screen dashboard. A full-screen
generative **core** (the orb) is the resting state. The assistant, **NOX**, is a voice-first agent
that answers by opening **windows** (modules and generated documents) on a stage in front of the
core, and by **docking** compact **widgets** into two vertical rails on the sides. A **bottom dock**
holds the module buttons around a central mic button.

The prototype calls the assistant NIX. In this project it is **NOX**; Meridian is the project name.
Everywhere the prototype says NIX the UI says NOX: the header `NOX // NEURAL INTERFACE`, the `NOX`
widget tag, `NOX IS COMPOSING…`, `COMPOSED BY NOX`, the `nox` event source, and the wake word.
The doc-window index badge `NX` stays (it is also a valid abbreviation of NOX).

The visual language: near-black (or near-white) flat field, a faint grid, thin 1px translucent
borders, frosted-glass panels, a serif display face for titles, monospace for everything that is
data, letter-spaced uppercase micro-labels, and a single accent hue per palette. Colour is almost
absent: the orb is the only large coloured thing; status colours (green/amber/red) appear only on
status, never as decoration.

## About the design file

`NIX v6.dc.html` is a **reference prototype in HTML**, not production code. It uses an in-house
component runtime (`<x-dc>`, `<sc-for>`, `<sc-if>`, a `Component` class with `renderVals()`, inline
styles only). Treat all of that as scaffolding:

- `<sc-for>` / `<sc-if>` → `{#each}` / `{#if}`; `renderVals()` → derived state; `style-hover` → CSS `:hover`.
- Inline styles become scoped CSS driven by the tokens below; the hex/rgba values in this document
  are the contract, not the prototype's inline style strings.
- All data in the prototype is fabricated (random walks, log templates, regex "intent" matching,
  a typed-out phrase instead of a mic, character-timed fake speech amplitude, procedurally drawn
  camera feeds, `nix.config.json` as a service registry). None of that is ported; this document
  describes only what each element **looks like and does**.
- Boot-time behaviours that exist only to demo the prototype (the 2.8 s scripted greeting, the
  `DEMO` phrase list) are not part of the spec.

### Not ported (dead or demo-only in the prototype)

- Subtitles: `hasSub`, `subText`, `subKey`, `subSize`, `subTop`/`subBottom`, the `subtitle()` chunker,
  `nixLine`/`nixShown`/`userLine`. There is **no transcript on screen**.
- Text input: `showInput`, `input`, `inputRef`, `onInput`, `onKey`, `submit`, `toggleInput`. There is
  **no text input in the UI** for talking to NOX; the fields there name or rename a workspace (see the
  workspace chip and Settings).
- Leftovers of the earlier single-panel design: `panelOpen`, `panelKey`, `panelW`, `panelFootL`,
  `panel`, `goHome`, `pinCurrent`, `isDoc`/`isServices`/… at top level.
- Widget types `summary` and `table` (`statusSummary()`, `containerTable()`): defined but never
  produced by any flow; the status report and container table are **docs** instead.
- `Module.code` (`NIX`, `SRV`, …): never rendered.
- Fake data generators, `DEMO`, `respond()`, `speak()` timing, `drawCams()` scenes, and the
  `nix.config.json` footnote under the Services grid (see Services window).

## Tokens

### Typography

| Role | Family | Notes |
|---|---|---|
| UI text, big numbers | Inter 400 / 500 / 600 | |
| Titles (window, widget, doc h1, pending card) | Instrument Serif 400 | `line-height:1`, `letter-spacing:-.01em` on window titles |
| Data, labels, buttons, clock, logs | JetBrains Mono 400 / 500 / **600** | The prototype requests only 400/500 yet uses 600 (synthesised bold); load 600 properly |

Micro-label recipe: JetBrains Mono, 9–10.5px, `letter-spacing` .06–.3em, uppercase. Section label
recipe (Inter): 11px / 500 / `letter-spacing:.06em` in `--nx-ac`.

### Colour variables

Set on the root element; every colour in the UI is `rgb(var(--nx-x))` or `rgba(var(--nx-x), a)`.

| Variable | Meaning |
|---|---|
| `--nx-bg` | Background field |
| `--nx-pn` | Panel surface (windows, widgets, buttons) |
| `--nx-hi` | Highlight: glass sheen, grid lines, window borders (white in dark, black in light) |
| `--nx-fg` | Primary text |
| `--nx-ac` | Accent: secondary text, borders, active glyphs, scrollbar thumb, orb UI chrome |
| `--nx-mu` | Muted fill (chip/track backgrounds, hover fills) |
| `--nx-sh` | Shadow colour |
| `--nx-vg` / `--nx-vga` | Vignette colour / alpha (default `0,0,0` / `.75`) |
| `--nx-page` | `<html>` background (hex), transitions `.6s ease` |

### Palettes

Three palettes; each has a dark variant, and `mono` and `meridian` also have a light one.
`A`, `B` are the orb's primary/secondary strand colours, `W` the white-ish spark colour.

**mono** (default)

| | bg | pn | hi | fg | ac | mu | sh | vg / vga | page | A | B | W |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dark | 3,3,3 | 7,7,7 | 255,255,255 | 255,255,255 | 206,206,206 | 140,140,140 | 0,0,0 | 0,0,0 / .75 | #030303 | 140,140,140 | 220,220,220 | 235,248,255 |
| light | 245,245,243 | 252,252,250 | 0,0,0 | 14,14,16 | 52,52,58 | 112,112,118 | 20,20,30 | 225,225,222 / .6 | #f3f3f1 | 140,140,140 | 220,220,220 | 235,248,255 |

**blue** (dark only)

| bg | pn | hi | fg | ac | mu | sh | page | A | B | W |
|---|---|---|---|---|---|---|---|---|---|---|
| 2,7,26 | 6,18,60 | 150,205,255 | 255,255,255 | 127,214,255 | 150,190,240 | 0,4,20 | #02071a | 90,170,255 | 150,230,255 | 225,245,255 |

**meridian**

| | bg | pn | hi | fg | ac | mu | sh | vg / vga | page | A | B | W |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dark | 9,15,14 | 12,21,19 | 120,220,195 | 226,236,232 | 70,190,165 | 112,140,132 | 0,0,0 | 0,0,0 / .75 | #090f0e | 60,170,145 | 240,130,50 | 215,250,240 |
| light | 236,240,236 | 250,252,249 | 10,60,50 | 14,30,27 | 20,125,105 | 98,120,114 | 20,40,35 | 215,224,218 / .6 | #e9eee9 | 60,170,145 | 240,130,50 | 215,250,240 |

Rules:

- A palette without a light variant (`blue`) uses its dark variant regardless of mode.
- Mode `auto` is **light between 07:00 and 18:00 (local time), dark otherwise**; `light` / `dark`
  force it. The OS colour-scheme preference is never consulted.
- Tokens are applied as a set; switching mode or palette swaps the whole set at once (the
  `--nx-page` background and window surfaces transition; the orb recolours on the next frame).
- Camera frames always use the **dark** variant of the current palette, even in light mode
  (`data-nx-dark`): they are video, not chrome.
- In light mode the orb canvas is drawn with the dark algorithm and then inverted with the CSS
  filter `invert(1) hue-rotate(180deg)`.

### Fixed semantic colours (not palette-dependent)

| Use | Value |
|---|---|
| ok / online (Services cards, doc `ok` tone) | `#3fd68b` |
| warn / degraded / amber / `POST` method / thinking tint | `#ffd34d` |
| bad / error / offline / `● REC` | `#ff6b8a` |
| Network sparkline | `#bfa8ff` |
| Camera tile background | `#030a1c` |
| Thinking orb accents, mic glow while thinking | `255,205,80` |
| Info level (events) | `rgba(ac, .6)` |

Note the prototype is inconsistent about "online": the Services window card uses green
`#3fd68b`, while the dock Services widget and doc tables render `ONLINE` in the accent colour.
The doc-table `ok` tone is `#3fd68b`; only the dock widget's online dot/label uses accent. Kept as
designed.

### Text opacity ladder (on `--nx-ac`)

`1` body text on panels · `.85` list text · `.8` clock, section values · `.75`–`.7` captions ·
`.65`–`.6` meta · `.55` header, dock labels, inactive module · `.5` timestamps, hints · `.45`
tertiary · `.4` done/disabled tags.

### Glass surfaces

| Surface | Recipe |
|---|---|
| Window | `linear-gradient(180deg, pn/.88, pn/.92)`, `backdrop-filter: blur(18px) saturate(1.4)`, 1px border, radius 16 |
| Dock widget | `linear-gradient(180deg, pn/.86, pn/.93)`, `blur(16px) saturate(1.3)`, border `hi/.1`, radius 12, shadow `0 18px 40px sh/.45, inset 0 1px 0 hi/.06` |
| Glass card (inside windows: service card, telemetry tile, feeder card) | `linear-gradient(145deg, hi/.09, hi/.025 55%, hi/.05)`, `blur(22px) saturate(1.6)`, border `hi/.13`, radius 14, shadow `inset 0 1px 0 hi/.14, inset 0 -1px 0 hi/.03, 0 10px 30px sh/.35`, then `inset 0 1px 0 ac/.1` overrides the shadow's inset top line |
| Pending card | `linear-gradient(180deg, pn/.94, pn/.97)`, `blur(16px)`, border `ac/.6`, radius 12 |
| Button (window) | fill `mu/.08` (hover `mu/.22`), border `ac/.35`, radius 8, text `ac` (hover `fg`) |

## Layout

Fixed full-viewport surface, `overflow:hidden`, `user-select:none`. Layers, back to front:

| z | Layer |
|---|---|
| — | Flat `--nx-bg` field (the prototype's radial gradient is four identical stops: a flat colour) |
| — | Grid (two layers, below) |
| — | Orb canvas, full-bleed |
| — | Vignette |
| — | Header, state label (pointer-events none) |
| 4 | Stage (windows) |
| 4 | Pending scrim (after the stage in DOM order, so above the windows) |
| 5 | Dock rails |
| 6 | Bottom dock |
| 25 | Pending card |
| 30 | Widget drag ghost |
| 60 | Snap guides (inside the stage) |

**Grid** (toggleable, default on): two stacked layers of 1px lines centred on the viewport:
44px pitch at `hi/.17` masked by `radial-gradient(ellipse 75% 70% at 50% 46%, bg 30%, transparent 100%)`,
and 11px pitch at `hi/.045` masked by `ellipse 50% 45% at 50% 46%, bg 20% → transparent`.

**Vignette**: `radial-gradient(ellipse at center, transparent 60%, vg/vga 100%)`.

**Header** (top 18px, centred, 10px mono, `letter-spacing:.06em`, `ac/.55`):
`◇ NOX // NEURAL INTERFACE ── HOST ── SVC on/total ── hh:mm:ss`. The `◇` is a 5px square border
(`ac/.7`) rotated 45°. Separators are 40×1px `ac/.3`. The clock is `ac/.8`, updates every second.

**State label** (top 58px, centred column, gap 9): the state word in mono 15px / 600,
`letter-spacing:.62em` with matching `padding-left` (to stay optically centred), coloured with the
state colour and `text-shadow: 0 0 12px <colour>`, colour transition `.4s`; below it the **tick bar**
(24 ticks, gap 3).

| State | Label | Colour |
|---|---|---|
| boot | `BOOTING` | `ac` |
| idle | `STANDBY` | `ac` |
| listening | `LISTENING` | `ac` |
| thinking | `THINKING` | `fg` |
| working | `WORKING` | `fg` |
| speaking | `SPEAKING` | `ac` |

Tick bar: ticks are 1px tall; every 6th tick (i % 6 = 0) is 8px wide, the rest 3px. Re-evaluated
every 140ms. Idle/boot: only the wide ticks are lit (opacity .85), others .2. Active states: tick *i*
is lit when `sin(t·.9 + i·.7) > .3` (`> -.2` while thinking; *t* = frame counter, one per 140ms),
producing a travelling pattern. Lit = opacity .85, unlit = .2.

**Stage** (windows): `top:108px; bottom:178px`, horizontal inset **20px**, or
`calc(min(300px, 24vw) + 55px)` on a side whose rail has widgets, and on both sides while a widget is
being dragged or a pin is pending (both rails appear then, empty ones included, to take the drop). A side
whose rail is empty keeps the 20px inset, so the stage grows into it; the other side is unaffected.
Transition on `left`/`right` `.4s cubic-bezier(.2,.8,.2,1)`. Once the stage stops changing (120ms), a
tiled layout is recomputed for the new size; windows the owner placed keep their fractions.

**Rails** (docks): `top:112px; bottom:116px`, 26px from the left/right edge, width `min(300px, 24vw)`.

**Stacked layout** (tall screens). A workspace has a `layout` setting, `auto` (default), `side` or `stacked`.
`auto` is stacked when the viewport is taller than 1.15 × its width (a monitor turned to portrait) and side
otherwise; `side` and `stacked` force it. The side layout is everything above. In the stacked layout the rails
become horizontal strips: **L is the strip above the stage** (`top:112px; left/right:26px`, 200px tall) and
**R the strip below it** (`bottom:116px`, same size), the stage keeps its 20px side inset and makes room at the
top and bottom instead, `calc(112px + 200px + 10px)` and `calc(116px + 200px + 10px)`, for a strip that holds
widgets (both while dragging or placing a pin, exactly as the side rule above). Cards keep their width
(`min(300px, 24vw)`) and sit in a row that scrolls sideways (wheel, touch or drag; edges fade as in the
vertical rail; no custom scrollbar). A dragged widget targets the strip nearest to the pointer **vertically**
and its slot index follows the pointer **horizontally**. Tiled windows on a portrait stage stack (the layout of
the landscape stage turned 90°): two windows one above the other, three as a wide one on top and two below.

**Bottom dock**: `bottom:30px`, centred row, gap 26, side padding 20.

## Core (the orb)

Full-bleed Canvas 2D drawn every animation frame; additive blending (`lighter`). It is the app's
resting state and its status display.

Visual state follows the **agent state** (`boot / idle / listening / thinking / speaking`) plus
three continuous inputs: speech **amplitude** (0–1, from real audio output), **mic level** (0–1,
from real audio input while listening) and a one-shot **kick** (0–1 pulse fired on events: window
opened, widget docked, service action run, speech start).

### Geometry

- Radius `R = min(w,h)·.25 · scale · (.6 + .4·boot) · (1 − think·.06 − listen·(.04 − mic·.05) + amp·.03 + kick·.05)`
  where `boot` eases from 0→1 over 2600ms starting 150ms after load with `1 − (1 − p)³`.
- Centre: `x = w/2 + mx·14`, `y = h·.46 + my·10`, with `mx, my ∈ [-.5, .5]` the pointer's offset from
  the viewport centre (parallax).
- Backing-store scale: `devicePixelRatio` capped at **1.75**.
- Rotation advances by `dt·(.05 + energy·.18 + think·.9)` (`dt` capped at 50ms).

### Strands

32 strands by default (configurable 16–80, step 4). Each strand has random: `off` (±.045 radial
offset), `bright` (.35–1), `drift` (±.04 rad/s), brightness-wave phase and speed, tilt, and six
harmonics `n ∈ {2,3,3,4,5,6}` with amplitude `(.1–1)/n^.7`, a random phase and a drift rate.
A strand is the polar curve sampled at **150 points** (`S`):

```
r(θ)  = 1 + off·(1 − think·.7) + Σ ampK·h.a·sin(h.n·θ + h.phase + tw·h.drift)
        + amp·.035·sin(9θ − 12t + k) + listen·.02·sin(14θ + 8t)
ampK  = .085 + energy·.04 + amp·.1 + listen·mic·.07 + kick·.05
tw    = t·(1 + energy·1.6 + amp·1.2)
angle = θ + rotation + drift·t
point = (cx + cos·r·R,  cy + sin·r·R·.985 + tilt·.07·sin(2θ + tphase + .4t)·R)
```

Each strand is drawn as **15 segments**; segment *j* has a brightness
`b = (.5 + .5·sin(2θ_j + bph + t·bsp·(1 + energy)))^2.2` and alpha
`(.05 + b·.45)·bright·(.55 + energy·.25 + amp·.35)·dim`, skipped below .015. Stroke width
`.7 + b·1.1`; colour `B` for the brightest segments of bright strands (`b > .88 && bright > .75`),
else `A`. After all strands, every strand path is stroked again as a glow: width 6 at alpha
`(.035 + amp·.04)·dim`, then width 16 at `.018·dim`.

A soft **halo** (radial gradient from `R·.6` to `R·1.6`, `A` at alpha
`(.05 + amp·.06 + energy·.03)·dim`, global alpha .55) sits behind.

**Sparks**: 22 sprites riding strands; `round(10 + energy·8 + amp·10)` are drawn. Each moves along its
strand at `v·(1 + energy·2 + think·3)`, flickers with `.55 + .45·sin(3t + 1.7i)`, size
`R·.055·s·(.8 + amp·.8)·flicker`. Sprite choice: yellow while `think > .4` (every second spark),
white-ish `W` for every 4th spark, else `A`. Sprites are 64×64 radial gradients
(white core → colour at .12 → colour/.25 at .35 → transparent).

**Thinking arcs** (when `think > .02`): three yellow arcs (`255,205,80`, width 1.2, alpha
`.45·think·dim`) at radii `R·(1.24 + .04j)` rotating in alternating directions.

**Listening rings** (when `listen > .02`): two expanding circles in `B`, radius `R·(1.6 − .5·p)`,
alpha `.3·listen·p·dim` with `p = (.8t + .5j) mod 1`.

Per-frame fade: instead of clearing, the canvas is `destination-out` filled with
`rgba(0,0,0, .2 + (1 − energy)·.1)`, leaving short trails.

### State dynamics (all values are per-frame eased toward a target)

| Variable | Target by state | Smoothing |
|---|---|---|
| `energy` | speaking .6, thinking .9, listening .45, boot .5, idle .15 | `+= (target − v)·.035` |
| `listen` | 1 while listening | `.05` |
| `think` | 1 while thinking | `.05` |
| `amp` | `ampT·(.85 + .15·sin(37t))`, where `ampT` is the audio amplitude (decays ×.85 per frame when not speaking) | `.22` |
| `mic` | while listening: random pulses `.3–1` (15% chance/frame) decaying ×.88; in production the real input level; ×.9 decay otherwise | `.25` |
| `kick` | set to a value on events, `kick *= .9` per frame; `kickV += (kick − kickV)·.3` | — |
| `dim` | 1 when no window is open, **.42** otherwise | `.05` |
| `scale` | 1 when no window is open, **.92** otherwise | `.05` |

`dim` multiplies all alphas and (with `boot`) fades the orb in on load.

Kick values: window opened 1; last window closed .5; widget docked .6; service action run .6; doc
composed 1; speech start 1; orb clicked 1.

### Behind windows

When any window is open the whole canvas is also CSS-filtered, transition `.7s ease`: dark
`blur(6px) brightness(.55) saturate(1.2)`, light `blur(6px) opacity(.45)` (after the light-mode
inversion). The orb is **clickable** only while no window is open: a click within `R·1.2` of the
centre shows `cursor:pointer`, fires a kick and starts listening.

## Bottom dock

Centred row, `bottom:30px`, gap 26. Three groups: left buttons (right-aligned, flex 1), the mic
(with a 34px spacer on each side, gap 12), right buttons (left-aligned, flex 1).

**Module buttons**: the modules, in order `Core, Services, Telemetry, Events, Cameras`, are split
at `ceil(n/2)`: the first three go left of the mic, the rest right. Each button is a column:
label (mono 10px, `letter-spacing:.06em`, uppercase) over a 1px **underline bar** (`ac`, glow
`0 0 6px ac`). Gap between buttons 22px, padding `8px 2px`.
Inactive: label `ac/.55`, bar width 0. Active (its window is open and not closing): label `fg`, bar
100%. Hover: label `fg`. Transitions: label colour `.3s`, bar width `.35s`.

`Core` is never "active"; it is the button that **closes every window**.

**Mic button**: see "Mic button" under v9 additions below (72px box, ring canvas, halt for NOX).

**Keyboard**: `1`–`9` open the *n*th module (so `1` closes all windows); `Esc` stops NOX when it is busy
(thinking, speaking, a task running), else drops a recording, else cancels a pending pin, otherwise closes the
active window. There is no key to start listening: the mic button and the orb do that. `W` toggles the
workspace panel, `⌥1–9` jumps to a workspace and `,` toggles Settings.

## Windows

A **window** is one module (Services, Telemetry, Events, Cameras) or the generated **doc**.
There is at most one window per module and a single doc window (opening a doc while one is open
replaces its content and replays the open animation). Core has no window.

### Anatomy

Absolute box on the stage: radius 16, 1px border, shadow, glass surface. Column layout:

1. **Sweep** (decorative): 38%-wide vertical band, gradient `transparent → ac/.16 45% → ac/.28 50% → ac/.16 55% → transparent`, runs `nxSweep 1.05s cubic-bezier(.3,.6,.3,1) .18s both` once on open.
2. **Top line**: 1px, inset 14% each side, gradient `transparent → ac/.95 → transparent`, glow `0 0 12px ac/.9`. Opacity **.95 when focused, .3 otherwise** (transition `.25s`).
3. **Header** (padding `16px 20px`, gap 14, bottom border `ac/.16`, `cursor:grab`, entrance `nxSub .5s ease .12s both`): 32px square badge (border `ac/.75`, radius 8, fill `mu/.14`, mono 12/600) showing the module's two-digit position in the module list (`01`…) or `NX` for the doc; the title block (kicker: Inter 11/500 uppercase `.06em`; title: Instrument Serif 28, ellipsised); the **PIN** button (30px tall, padding `0 12px`, mono 10 `.16em`, a 5px rotated diamond + label); the **✕** close button (30×30).
4. **Body**: scrolls vertically, padding `18px 20px`.
5. **Footer** (padding `11px 20px`, top border `ac/.16`, mono 10.5/600 `.2em`, entrance `nxSub .5s ease .5s both`): left a context line (below), right `SYNCED AT hh:mm`.

Focused vs unfocused: border `hi/.2` vs `hi/.08`, and the top line below. The prototype also sets
per-state shadows (`0 26px 70px sh/.5` focused, `0 12px 34px sh/.35` otherwise, a stronger one while
dragged), but `nxEdge` runs with `fill-mode: both` and keeps animating `box-shadow`, so its final
resting shadow (`0 30px 80px sh/.6` plus the inset top line) always wins and the per-state shadows
are never visible. The resting shadow is the spec. Border transition `.25s`.

Module titles, kickers and footer context lines:

| Module | Title | Kicker | Footer left |
|---|---|---|---|
| Services | Services | Launcher | `on/total SERVICES ONLINE` |
| Telemetry | Telemetry | host · live | `HOST · LIVE` |
| Events | Events | Unified log stream | `n EVENTS BUFFERED` |
| Cameras | Cameras | Feeds · linked automation | `n FEEDS` |
| Doc | the doc's title | the doc's kicker | `COMPOSED BY NOX · n BLOCKS` |

### Resize handles (invisible hit areas straddling the border)

| Handle | Geometry | Cursor |
|---|---|---|
| E | right −5px, 10px wide, inset 18px top/bottom | `ew-resize` |
| W | left −5px, same | `ew-resize` |
| S | bottom −5px, 10px tall, inset 18px left/right | `ns-resize` |
| SE | 20×20 at the bottom-right corner, with a visible 8×8 corner mark (`ac/.55`, 1.5px, bottom-right borders only, radius `0 0 4px 0`) | `nwse-resize` |
| SW | 20×20 at the bottom-left corner | `nesw-resize` |

There is no N, NE or NW handle: the top edge belongs to the header grip. All use `touch-action:none`.

### Open / close animations

| Event | Animation |
|---|---|
| Open | `nxIn .62s cubic-bezier(.2,.7,.2,1) both` **and** `nxEdge 1.1s ease-out both` together, plus the sweep and the staggered `nxSub` on header/footer |
| Close | `nxClose .46s cubic-bezier(.6,0,.3,1) forwards` (a CRT-style collapse: squash to a line, brighten, vanish); removed from the tree at 470ms |
| Reposition (auto-tile, arrange, maximise, stage inset change) | `left/top/width/height .42s cubic-bezier(.2,.8,.2,1)`; **no transition while any window is being dragged or resized** |

### Layout model

Window rectangles are stored as **fractions of the stage** (`fx, fy, fw, fh`), so they survive
stage resizes (including the rails appearing, which changes the stage width). A window's pixel
rect is its fractions × stage size, then clamped: width ≥ `min(340, W)`, height ≥ `min(230, H)`,
fully inside the stage. Constants: min size **340×230**, gap **14**, snap threshold **8**.

Two modes: **tiled** (default) and **custom**.

- Tiled: the window set is auto-laid-out on every open and close.
- Custom: entered the moment the user drags, resizes or maximises a window, or when a window
  is opened that could not be tiled (below). In custom mode opens and closes do not re-tile. The
  header shows `ARRANGE` (full opacity in custom mode, .45 otherwise); pressing it re-tiles all
  open windows in the order they were opened, returns to tiled mode and forgets maximise-restore
  state. Closing the last window returns to tiled mode.

**Tile rules** (`n` windows, in open order; `cols` = `W ≥ 2·340 + 14`; `rows` = `H ≥ 2·230 + 14`):

| n | Layout |
|---|---|
| 1 | One window, width `min(940, W)`, centred, full height |
| 2 | Side by side if `cols` (each `(W − 14)/2`, full height); else stacked if `rows`; else cannot tile |
| 3 | Needs `cols && rows`. Left column `max(340, (W − 14)·.56)` full height; right column splits into two halves |
| 4 | Needs `cols && rows`. 2×2 grid |

If the stage cannot tile the set, the new window opens in **custom** mode, **cascaded**: size
`min(W, max(340, .6W)) × min(H, max(230, .78H))`, horizontally centred plus `28px · (k mod 4)`,
vertically `24px · (k mod 4)` (`k` = windows already open), clamped inside the stage.

**Window limit: 4.** Opening a fifth closes the window with the **lowest z** (least recently
focused, not necessarily the oldest) with the normal close animation, and an event
`window limit · closed <id>` is logged.

**Opening, focusing, closing**

- Opening an already-open module focuses it. The orb gets a kick.
- Focus (any pointer-down on a window) raises it above the others and makes it `active`.
- Closing re-tiles the rest (tiled mode only) and activates the topmost remaining window.
- `Core` / key `1` closes every window with a **70ms stagger** between them.
- **Double-click on the header** toggles **maximise**: the window fills the whole stage (`0,0,1,1`),
  raised to the top, previous fractions remembered and restored by the next double-click. It is
  a no-op if the window already fills the stage. Dragging or resizing a maximised window discards the
  remembered rect. Maximising switches to custom mode.

### Drag and resize

Pointer-down on the header (not on a button) or a handle focuses the window and arms the gesture;
it starts after **3px** of movement. A press without movement only focuses. While moving:

- The stage gets a dashed outline: `inset:-6px`, 1px dashed `ac/.18`, radius 20, `nxSub .2s ease`.
- Cursor is `grabbing` (move) or the handle's resize cursor, for the whole page; text selection off.
- The window is clamped to the stage.

**Snapping** (threshold 8px, on both axes independently). Snap *targets* are built from the stage and
the other open windows:

- x: stage left `0`, stage centre `W/2` (marked *centre*), stage right `W`; for each other window its
  left, centre, right, and `left − 14`, `right + 14` (marked *gap*).
- y: the same with top/bottom/centre and `± 14`.

When moving, the dragged window's left, centre and right (and top, centre, bottom) edges are tested
against the targets; the smallest absolute difference ≤ 8 wins, provided the snap keeps the window
inside the stage. When resizing, only the edges being moved are tested (right edge for E/SE,
left for W/SW, bottom for S/SE/SW), and the result must respect the minimum size and the stage.

**Guides**: when moving, after snapping, a guide is drawn for the snapped target **and** for every
target an edge of the window coincides with (within .5px); when resizing, only for the snapped target. A guide is a full-height (vertical) or full-width
(horizontal) 1px line in `ac`, glow `0 0 6px ac/.6`, opacity **.75 centre, .4 gap, .55 edge**;
a line at the far edge (`W` / `H`) is drawn 1px inward so it stays visible.

**Readout**: a pill centred under the dragged window (`bottom:-30px`): mono 10 `.12em`, `pn` text on
`ac` fill, `0 0 14px ac/.4` glow. Text is `X 120  Y 48` when moving (two spaces between the pairs)
and `640 × 400` when resizing.

On release, if the pointer moved, the layout becomes custom.

### Pin to dock

The header's **PIN** button asks to dock a widget representing the window:

| Window | Widget it creates |
|---|---|
| Services | `services` (SYS) |
| Telemetry | `tele` (SYS) |
| Events | `logs` for the window's current filter (SYS) |
| Cameras | `feeder` (SYS) |
| Doc | a `doc` widget (NOX) with the doc's blocks, kicker `COMPOSED BY NOX` |

Label: `PIN TO DOCK` → `PINNING…` while a pin is pending → `DOCKED` when an equivalent **system**
widget is already docked (same `type`, same `svc`). Pressing it when already docked does not
duplicate: it scrolls the existing widget into view and **flashes** it. Doc widgets are never
"docked" in this sense; each pin creates a new one. A NOX request to pin a widget goes through the
same flow (the pending card appears, or the existing widget flashes).

## Windows' content

### Services

Grid `repeat(auto-fill, minmax(250px, 1fr))`, gap 10, of glass cards (padding 14, gap 11). Cards
enter with `nxSub .55s ease` delayed `.16s + .06s·index`. An offline card is at opacity .5.

- **Head**: 36px square mono badge (the service's two-letter `mono`, border `ac/.7`, radius 8, 13/600),
  name (15/600 `fg`), description (12, `ac/.75`), and a **status pill** on the right: Inter 10/500,
  border and text in the status colour, radius 20, padding `3px 9px 3px 7px`, fill `pn/.6`, with a
  6px dot (glow `0 0 8px`). States: `Online` green, `Degraded` amber, `Offline` red.
- **Meta row**: mono 10 `.06em` `ac/.65`: runtime, address, `UP <uptime>`.
- **Endpoints** (only if the service has actions; top border `ac/.14`, padding-top 10): rows of
  grid `40px 1fr auto auto`, mono 11: method (9px `.1em`; `GET` in `ac`, `POST` in `#ffd34d`), path
  (ellipsised), result, and a `RUN` button (mono 9 `.14em`, border `ac/.4`, radius 3). Result text is
  `—` (never run), `· · ·` (pending), then `202 · 41ms` (status · latency) in `ac`.
- **Actions** (bottom, `margin-top:auto`): `LOGS →` (opens Events filtered to this service) when the
  service emits events, `OPEN ↗` (new tab) when it has a URL. Both mono 9 `.16em`, border `ac/.28`,
  radius 3; hover brightens border and text.
- **Footnote** below the grid (mono 10, `ac/.5`): the prototype reads "Register or retire services in
  nix.config.json". That file is a design-tool artefact and is **not adopted**; the note stays as a
  hint but its wording is decided together with the settings mechanism (see architecture).

### Telemetry

- **Tiles**: grid `repeat(auto-fit, minmax(190px, 1fr))`, gap 10, glass cards (padding `14px 14px 8px`):
  label (Inter 11/500), value (32/500 `fg`) + unit (mono 11), and a **sparkline**. Tiles: `CPU %`,
  `MEMORY / 64 GB` (value with one decimal), `CORE TEMP °C`, `NETWORK MB/s`. Tile `i` enters with
  `nxSub .55s ease` delayed `.16s + .07s·i`.
- **Sparkline**: SVG `viewBox 0 0 120 36`, `preserveAspectRatio:none`, height 38; 48 samples across
  120 units; y = `34 − v/max·30`; a polyline (stroke 1.4, `vector-effect:non-scaling-stroke`) over an
  area polygon at fill-opacity .12. Colour `ac`; **temperature is `#ffd34d`, and `#ff6b8a` above
  70°C**; network is `#bfa8ff`. Scale maxima: CPU 100, memory 64, temp 100, network 130.
- **CONTAINERS** (Inter 11/500 section label, then rows): grid `minmax(90px,140px) 1fr 56px 64px`,
  gap 14, padding `9px 0`, mono 12: name, a 5px **usage bar** (track `mu/.22`; fill gradient
  `mu → colour` with glow; width = CPU %; entrance `nxBar .9s cubic-bezier(.2,.8,.2,1) .35s both`,
  later changes `width .8s ease`), CPU % (right, `fg`), memory in MB (right, `ac/.65`). Degraded
  services use `#ffd34d` for the bar; others `ac`.

### Events

- **Filter chips** (mono 10 `.1em`, padding `5px 10px`, radius 3): `ALL`, one per service that emits
  events, and `nox` (events NOX produced). Active chip: fill `mu/.22`, border `ac/.7`, text `fg`;
  inactive: transparent, border `ac/.22`, text `ac/.7`. At the far right a `● LIVE` marker (mono 9
  `.22em`, `ac`) blinking with `nxBlink 1.4s ease-in-out infinite`.
- **Rows**: newest first, up to 60 shown (120 buffered). Grid `92px 80px 44px 1fr`, gap 12, padding
  `6px 0`, bottom border `ac/.07`, mono 12, each entering with `nxSub .4s ease`: timestamp
  `HH:MM:SS.mmm` (`ac/.5`), source (`ac`, ellipsised), level (9px `.1em`: `INFO` `ac/.6`, `WARN` `#ffd34d`,
  `ERROR` `#ff6b8a`), message (`ac`).

### Cameras

Responsive `repeat(auto-fit, minmax(260px, 1fr))`, gap 12: a column of camera tiles, plus (if a
feeder automation is linked) the automation card.

- **Camera tile**: 16:9, radius 11, 1px border `ac/.45`, background `#030a1c`, always dark tokens;
  entrance `nxSub .6s ease .2s`. Overlays (mono 10): top-left `● REC` (`#ff6b8a`, blinking
  `nxBlink 1.2s ease-in-out infinite`) and the camera label (`fg`); top-right timestamp `hh:mm:ss`
  (`ac`, `.1em`); bottom-right `DISPENSING` badge while a dispense runs (mono 10 `.2em`, `bg` text
  on `ac` fill, radius 2, `nxBlink .7s ease-in-out infinite`). The prototype lays film grain
  (alpha .14), a scanline pattern (1px every 3px, `rgba(0,0,0,.16)`) and a rolling light band over its
  placeholder frames; those are placeholder-feed treatment, optional for real video.
- **Automation card** (glass card, padding 16, gap 16, `nxSub .55s ease .3s`): label
  `AUTOMATION · FEEDER`; `NEXT FEEDING` with the next slot time (34/500) and `in 2h 14m` (mono 11);
  `HOPPER` with percentage and a 5px bar (as the container bar, entrance delayed `.45s`); the day's
  schedule, rows grid `52px 1fr auto` mono 12 with a tag `NEXT` (`ac`) / `DONE` (`ac/.4`) / `ARMED`
  (`ac/.7`) (9px `.14em`); the **`DISPENSE NOW`** button (mono 13/600 `.3em`, padding 13, radius 10,
  border `ac/.6`, fill `mu/.16`, glow `0 0 20px mu/.25`, hover fill `mu/.32`); and
  `LAST FED hh:mm · portion` (mono 10 `.1em`, `ac/.6`).

As built, the automation card shows only what the device reports: the schedule rows and `NEXT FEEDING`
are left out until the device's schedule is decoded (see the tuya-feeder README), `HOPPER` shows the
device's `FULL` / `LOW` / `EMPTY` state with a level bar instead of a percentage, and `DISPENSE NOW` is
two-step (`CONFIRM · 1 PORTION`, cancelling itself after 5s) because it dispenses real food.

### Doc

A document of **typed blocks**, streamed in one block at a time while NOX composes. See
[Doc blocks](#doc-blocks). In the window the blocks stack with gap 18; below the last block, while
composing, a skeleton shows two bars (10px tall, 72% and 48% wide, `mu/.18`, `nxFlash 1.1s ease-in-out infinite`,
the second delayed `.2s`) and `NOX IS COMPOSING…` (mono 9.5 `.22em`, `ac/.6`). A **live** doc
re-renders its blocks in place as its data changes (for example the deploy doc's progress bar,
whose width transitions `.7s cubic-bezier(.4,0,.2,1)`).

### As built: background-task chip

Not in the prototype. While NOX runs **more than one** background task, the header shows a pill after
`SVC n/m`: `● N TASKS`, mono 10 `.14em`, 1px border and text in the warning amber (`--nx-wn`), the dot
pulsing with `nxFlash 1.1s`. It is clickable (the header is otherwise pointer-events none) and opens the
newest task's document; it leaves when one or none runs (a single task has its card, below). Bound dock widgets (`LIVE`) dim to .55 opacity with
`SOURCE NOT ANSWERING · SHOWING THE LAST READING` when their source fails.

### As built: offline state

Not in the prototype. When the link to the server is down the state label reads `OFFLINE` in `#ff6b8a`
with its ticks unlit, the header shows a pill `● RECONNECTING` (1px border `#ff6b8a/.5`, the dot pulsing
with `nxFlash 1.1s`), and the mic is dimmed like the unavailable state. It clears by itself on reconnect.

## Doc blocks

Every block enters with `nxSub .5s cubic-bezier(.2,.7,.2,1) both`. Blocks arrive one every **260ms**
during composition. Tones: `ok #3fd68b`, `warn #ffd34d`, `bad #ff6b8a`, `accent` = `ac`, `fg`,
`dim` = `ac/.7`.

Sizes below are *window / dock widget* (the widget uses the compact scale, stack gap 10).

| Block | Fields | Look |
|---|---|---|
| `h` level 1 | `text`, `eyebrow?` | Optional eyebrow (mono 9.5 `.2em`, `ac/.6`) over Instrument Serif 30 / 20, `line-height:1.05`, `text-wrap:balance` |
| `h` level 2 | `text` | Section heading: 5px rotated diamond, mono 10.5 / 9 `.18em` uppercase `ac`, then a 1px rule fading `ac/.3 → transparent` |
| `p` | `text` | 14.5 / 12.5, line-height 1.6, `fg` at .88, `max-width:68ch`, `text-wrap:pretty` |
| `stats` | `items[{label, value, unit?, note?, tone?}]` | Grid `auto-fit minmax(150px / 100px, 1fr)`, gap 10 / 6; tile: border `ac/.14`, radius 10, fill `mu/.06`, padding 14 / 9; label mono 9 `.16em` `ac/.7`; value 30 / 18, weight 500 over `fg` with unit 12.5 / 10.5 `ac/.6`; optional note mono 9.5 in the tone colour (default dim) |
| `progress` | `items[{label, value 0–100, detail?, tone?}]` | Row: uppercase mono label (11.5 / 9.5, `.1em`, `ac/.8`) and `NN%` (`fg`); track 6 / 4px (`mu/.22`, radius 3) with fill in the tone (default accent) plus glow; optional detail mono 9.5 `ac/.55`. Fill width transition `.7s cubic-bezier(.4,0,.2,1)` |
| `table` | `cols[{label, align?, w?}]`, `rows[cell \| {v, tone}]` | Rounded container (border `ac/.14`, radius 10); header row fill `mu/.08`, mono 8.5 `.16em` `ac/.65`; body rows mono 11.5 / 9.5, top border `ac/.08`, hover fill `mu/.06`; first column `fg`, others dim unless a tone is set; cells ellipsised; column widths from `w` (default `minmax(0,1fr)`) |
| `list` | `items[{text, meta?, state: done\|active\|todo}]` | Grid `16px 1fr auto`, rows with bottom border `ac/.07`: **done** = filled 10px square `ac` with a `pn` ✓ and dimmed text; **active** = ringed 10px circle with a dot pulsing via `nxFlash 1s ease-in-out infinite`, `fg` text; **todo** = dashed 10px square `ac/.45`, text `ac/.85`. Text 13.5 / 11.5, meta mono 9.5 `ac/.5` |
| `callout` | `tone`, `title`, `text` | Border and tone colour, fill `mu/.07`, radius 10, padding 14 / 9; a 7px rotated diamond in the tone (glow `0 0 8px`), uppercase mono title 10 `.16em`, body 13.5 / 11.5 at line-height 1.5, `fg` .85 |
| `kv` | `items[{k, v, tone?}]` | Rows with top border `ac/.1`, mono 11.5 / 9.5, key `ac/.7` (`.06em`), value right-aligned (`fg` or tone) |
| `code` | `lang`, `text` | Container border `ac/.14`, radius 10, fill `sh/.28`; caption bar (mono 8.5 `.18em`, `ac/.55`, bottom border `ac/.1`); `<pre>` mono 11.5 / 9.5, line-height 1.6, horizontal scroll |
| `tags` | `items[{label, tone?}]` | Pills: mono 9.5 `.12em`, padding `3px 9px`, radius 999, 1px border and text in the tone (default dim) |
| `divider` | — | 1px line, gradient `transparent → ac/.3 → transparent` |

## Dock widgets

Compact cards stacked in the two rails (**L** left, **R** right). A widget's identity is its
`type` plus parameters; its tag says who made it: **`SYS`** (system, `ac/.6` text, border `ac/.25`)
or **`NOX`** (made by the agent, `ac` text, border `ac/.6`).

### Anatomy

Glass surface with a 1px top line (inset 18%, `ac/.7`). Column:

1. **Header** (padding `10px 10px 10px 12px`, `cursor:grab`, bottom border `ac/.12` — `0` when collapsed):
   a 2×3 dot **grip** (2px dots, gap 2, opacity .6); the title block (a line with the source tag
   (mono 9 `.14em`, padding `1px 5px`, radius 3) and the kicker ellipsised, over an Instrument Serif
   20 title); the slot label (`L·02`, mono 9 `.12em`, `ac/.45`); and two 22×22 buttons (radius 6,
   border `ac/.25`, hover `ac/.7`): collapse (`−` / `+`) and close (`✕`).
2. **Body** (padding `10px 12px 12px`).

### Types

| Type | Source | Kicker | Body |
|---|---|---|---|
| `tele` | SYS | `HOST · LIVE` | Three rows (grid `40px 1fr 66px`, gap 10): label `CPU`/`MEM`/`TEMP` (mono 9.5 `.12em`), a 22px sparkline (last 32 samples, viewBox 120×24, stroke 1.2, fill .1), value + unit (mono 12). Temp colour as in Telemetry |
| `feeder` | SYS | `AUTOMATION · LIVE` | `NEXT FEEDING` (10/500) with the time (26/500) and `in 2h 14m` (mono 10.5); `HOPPER` label + percentage and a 4px bar (`width .8s ease`); `LAST FED hh:mm` (+ ` · DISPENSING`) |
| `services` | SYS | `LAUNCHER · LIVE` | Rows grid `8px 1fr auto`, gap 9, mono 11: status dot (glow), name, state tag (9 `.12em`); dot/tag use accent for online, amber for degraded, red for offline |
| `logs` | SYS | `UNIFIED LOGS · LIVE` for all, `LOGS · LIVE` for one service (title = the service, or `Events`) | Latest **6** events, grid `54px 32px 1fr`, gap 8, mono 10.5: `HH:MM:SS`, level (8.5), message (prefixed with the source when showing all); rows enter with `nxSub .4s ease` |
| `doc` | NOX | `COMPOSED BY NOX` | The doc's blocks at the compact scale |

A dock never duplicates a system widget (same `type` and `svc`): asking for one that exists flashes
and scrolls to it.

### Collapse and close

- **Collapse** animates `grid-template-rows 1fr → 0fr` over `.38s cubic-bezier(.4,0,.2,1)`; the body
  simultaneously goes to opacity 0 (`.28s ease`), `translateY(-8px)` (`.38s cubic-bezier(.4,0,.2,1)`) and
  `blur(4px)` (`.28s ease`); the header's bottom border fades out (`.3s ease`). Collapsed state
  persists with the widget.
- **Close** plays `nxOut .55s cubic-bezier(.5,0,.2,1) forwards`: it fades and blurs out sliding
  **24px toward its own side** (`--dx` = −24px in L, +24px in R), then its height and bottom margin
  collapse (`--h` = its measured height) so siblings close the gap; removed at 560ms. Pointer events
  are off while closing. Clearing NOX's widgets closes each with a **90ms stagger**.
- **Enter**: `nxIn .55s cubic-bezier(.2,.7,.2,1) both`. A widget that was just dropped plays
  `nxLand .45s cubic-bezier(.2,.8,.2,1) both` instead (scale 1.035 settling with an accent edge glow).
- **Flash**: an overlay (radius 12, 1px `ac` border, `inset 0 0 24px ac/.25`) plays
  `nxFlash .55s ease-in-out` four times; removed after 2.3s. Used when a widget lands and when a pin
  targets an existing widget.

### Where new widgets go

Normally the user chooses: every new widget goes through the [pending pin](#pending-pin) flow and
lands where it is dropped. The prototype also carries a fallback for docking without a choice (it
is never reached by its own flows): the widget is appended to the rail with **fewer widgets** (L on
a tie), the rail smooth-scrolls to the bottom after 60ms, the widget flashes and the orb gets a
kick. In both cases an event `widget docked · <title> → L·03` is logged under source `nox`.

The prototype starts with `tele` docked in L and `feeder` in R; the first-run workspace takes the
same default.

### Rails

- **Header row** above each rail (mono 9 `.2em`, `ac/.55`): `◇ DOCK·L` (mirrored for R), a 1px rule
  fading out (`ac/.3 → transparent`), and the two-digit widget count (`ac/.8`).
- Rails are visible (opacity transition `.35s`) when they hold widgets, or while a drag or pin is in
  progress; otherwise hidden and non-interactive.
- The widget list scrolls vertically with the native scrollbar hidden. When it overflows, the top
  and bottom edges fade out via a mask (`26px` fade, applied only on an edge that has more content).
- **Custom scrollbar**, outside the rail edge (`-17px` from the side that faces the screen edge,
  7px wide, inset 0 / 18px): a 1px spine (`ac/.16`), 5px rotated diamond caps at both ends
  (`ac/.4` border), 7×1px **tick marks** (`ac/.45`) at each boundary between widgets (excluding the
  first), and a 4px **thumb** (`ac`, glow `0 0 10px ac`, radius 2) proportional to the visible
  fraction, draggable (`touch-action:none`).
- **Hot highlight** while a drag targets the rail: a rounded rectangle (`inset:-8px -8px 10px`, radius
  16, fill `mu/.07`, ring `inset 0 0 0 1px ac/.2`, glow `0 0 40px ac/.08`) fades in, `.25s`.

## Dragging widgets between rails

Widgets reorder within a rail and move across rails. Pointer-down on the header (not on a button)
arms the drag; it starts after **5px**.

- **Ghost**: a clone of the card follows the pointer, `position:fixed`, same width, anchored at the
  grab point (`transform-origin` = grab offset). It is scaled **1.04**, tilted by horizontal
  velocity: `rot = clamp(−7°, 7°, rot·.6 + Δx·.35)`, easing back to 0 when the pointer pauses for
  90ms. Shadow `0 30px 70px sh/.6, 0 0 36px ac/.25`; transitions `transform .22s cubic-bezier(.2,.8,.2,1)`,
  `box-shadow .3s`. The clone is capped at 300px height and, when taller, fades out at the bottom
  (`50px` mask). A pill `→ L·02` (mono 9.5 `.16em`, `pn` on `ac`, glow) hangs off its top-right corner
  (`top:-10px; right:12px`); it reads `DROP ON A DOCK` when no rail is targeted and fades out on landing.
- **Source**: the original widget leaves its rail's list while dragged; its place is taken by the slot.
- **Target rail**: the rail whose bounding box is horizontally nearest to the pointer (distance 0
  when inside). A dragged widget **always** targets a rail. (A pending pin targets a rail only
  within 140px of one.)
- **Auto-scroll**: within 40px of a rail's top or bottom edge the rail scrolls 14px per pointer move.
- **Slot index**: the number of other widgets whose vertical midpoint is above the pointer.
- **Slot placeholder**: a dashed card (radius 12) showing `SLOT L·02` (mono 10 `.22em`), entering with
  `nxSlotIn .3s ease` and pulsing its border via `nxSlotPulse 1.6s ease-in-out infinite`
  (`ac/.18 ↔ ac/.55`). In the targeted rail: height = dragged height clamped to 64–320px, border
  `ac/.75`, fill `mu/.12`, text `ac`; in the other rail: 52px tall, border `ac/.22`, text `ac/.4`
  (height and border transition `.2s`).
- **Reflow**: whenever order, target or slot index changes, every sibling plays a **FLIP**:
  `translateY(oldY − newY) → 0` over **300ms `cubic-bezier(.2,.8,.2,1)`** (only for movements > 1px
  within the same rail).
- **Drop**: the ghost flies to the slot's rect with rotation 0, scale 1, a softer shadow
  (`0 10px 24px sh/.35`), over `.32s cubic-bezier(.2,.8,.2,1)`; after 320ms the widget is inserted
  at the slot with the `nxLand` animation and a flash. A pending pin dropped away from any rail flies
  back to its centre position and stays pending.

## Pending pin

Triggered by PIN on a window, or by NOX asking to dock a widget that doesn't exist yet.

1. A **scrim** covers the screen below the rails (`radial-gradient(ellipse at center, sh/.35, sh/.7)`,
   `blur(7px) saturate(.6) brightness(.7)`, opacity transition `.35s`); clicking it cancels.
2. The stage insets and both rails appear (even if empty), each showing a 52px dashed slot.
3. The **pending card** appears centred over the scrim with `nxLift .45s cubic-bezier(.2,.8,.2,1) both`
   (rise 40px, scale .82 → 1, blur 12 → 0). The card (min 250px, `min(300px, 24vw)` wide, border `ac/.6`,
   glow `0 0 30px ac/.2`, shadow `0 28px 70px sh/.6`) shows a grip, the widget's kicker (mono 9 `.14em`)
   and title (Instrument Serif 21), and a 24px round ✕. It **jiggles**
   (`nxJiggle .28s ease-in-out infinite alternate`: ±1.4° with a 1px bob). Under it: a pill
   `← DRAG TO A DOCK →` (mono 10 `.22em`) and the hint `ESC TO CANCEL` (mono 9 `.2em`, `ac/.5`).
4. The user drags the card (ghost and slot rules above). While it is being dragged, the card at the
   centre hides (opacity 0, `.15s`) and cancel is disabled.
5. **Dropping on a rail** inserts the widget there (`nxLand` + flash, orb kick .6, event logged).
6. **Cancel** (✕, scrim click or `Esc`) plays `nxDrop .26s ease-in forwards` (sink 30px, scale .85,
   blur 10) and clears the pending state after 260ms.

## Animation catalogue

Keyframes (`@keyframes`) and where they are used. Names are the prototype's and are kept.

| Name | Keyframes | Used for |
|---|---|---|
| `nxIn` | 0%: opacity 0, scale 1.04, blur 18 + brightness 1.8 → 35%: .55, blur 9 / 1.4 → 70%: 1, blur 1.5 / 1.1 → 100%: clear | Window open (`.62s cubic-bezier(.2,.7,.2,1)`); widget enter (`.55s` same curve) |
| `nxSub` | 0%: opacity 0, `translateY(4px)`, blur 10 → 60%: .9, blur 2 → 100%: clear | Window header/footer, cards, log rows, doc blocks, stage outline (`.2s`–`.6s`, `ease` or `cubic-bezier(.2,.7,.2,1)`) |
| `nxSweep` | `translateX(−120%) skewX(−18deg)`, opacity 0 → 15%: 1 → `translateX(320%)`, opacity 0 | Light band across a window on open (`1.05s cubic-bezier(.3,.6,.3,1) .18s`) |
| `nxEdge` | box-shadow: bright 1px `fg/.7` ring + `70px hi/.25` outer + `50px hi/.12` inset → resting shadow (`0 30px 80px sh/.6`, inset top line `hi/.08`) | Window open edge glow, together with `nxIn` (`1.1s ease-out`) |
| `nxClose` | 0%: clear → 28%: scale(1.01, .9), brightness 1.4 → 60%: scale(1.03, .012), brightness 2.4, blur 1 → 100%: opacity 0, scale(0, .006), brightness 3, blur 2 | Window close (`.46s cubic-bezier(.6,0,.3,1) forwards`) |
| `nxBar` | `scaleX(0) → scaleX(1)` (origin left) | Usage/hopper bars on mount (`.9s cubic-bezier(.2,.8,.2,1)`, delayed .35–.45s) |
| `nxBlink` | 50%: opacity .25 | `● LIVE` (1.4s), `● REC` (1.2s), `DISPENSING` (.7s), all `ease-in-out infinite` |
| `nxFlash` | 0%, 100%: opacity 0; 50%: 1 | Widget flash (`.55s ease-in-out`, ×4), active list dot (`1s`), composing skeleton (`1.1s`) |
| `nxJiggle` | rotate(−1.4°) → rotate(0) translateY(−1px) → rotate(1.4°) | Pending card (`.28s ease-in-out infinite alternate`) |
| `nxOut` | 0%: clear, `max-height: var(--h)` → 38%: opacity 0, scale .94, `translateX(var(--dx))`, blur 10 + brightness 1.8 → 100%: same, `max-height:0`, `margin-bottom:-10px`, border 0 | Widget close (`.55s cubic-bezier(.5,0,.2,1) forwards`) |
| `nxLift` | 0%: opacity 0, `translateY(40px) scale(.82)`, blur 12 → 60%: 1, blur 1 → 100%: clear | Pending card in (`.45s cubic-bezier(.2,.8,.2,1)`) |
| `nxDrop` | clear → opacity 0, `translateY(30px) scale(.85)`, blur 10 | Pending card out (`.26s ease-in forwards`) |
| `nxLand` | 0%: scale 1.035, ring `ac/.7` + `0 0 40px ac/.3` → 100%: none | Widget just dropped (`.45s cubic-bezier(.2,.8,.2,1)`) |
| `nxSlotIn` | opacity 0, `scaleY(.6)` → clear | Slot placeholder appears (`.3s ease`) |
| `nxSlotPulse` | border colour `ac/.18` ↔ `ac/.55` | Slot placeholder (`1.6s ease-in-out infinite`) |
| `nxPing` | scale 1, opacity .7 → scale 2.1, opacity 0 | Mic rings while listening (`1.2s ease-out infinite`, second ring delayed `.6s`) |

Transitions worth noting: body background `.6s ease`; orb canvas filter `.7s ease`; stage inset
`.4s cubic-bezier(.2,.8,.2,1)`; window geometry `.42s cubic-bezier(.2,.8,.2,1)`; dock label colour
`.3s`, underline width `.35s`; arrange button opacity `.25s`; mic `box-shadow`/`border-color` `.4s`;
state label colour `.4s`; rail opacity `.35s`; scrim opacity `.35s`; slot height/border `.2s`;
progress fills `.7s cubic-bezier(.4,0,.2,1)`; bars `.8s ease`.

## Agent states and what the UI does

| State | Orb | Label | Mic |
|---|---|---|---|
| boot | rises over 2.6s | `BOOTING` | resting |
| idle | low energy | `STANDBY` | resting |
| listening | rings pulse in, strands react to the mic level | `LISTENING` | pinging rings |
| thinking | slow strong rotation, shrinks slightly, yellow arcs and sparks | `THINKING` (`fg`) | yellow tint |
| speaking | strands and sparks react to the speech amplitude | `SPEAKING` | resting |

NOX leaves *speaking* for *standby* when the audio ends. Opening or closing windows, docking widgets
and finishing actions all kick the orb. Everything NOX does on screen (window opened or closed,
widget docked, service action run) is also written to the event stream under source `nox`.

## Rules at a glance

- Max **4** windows; one per module plus one doc. The least-recently-focused closes when a fifth opens.
- Tiled until the user touches a window; then custom with `ARRANGE` to get back.
- Layout is stored as fractions of the stage; rails appearing or disappearing re-flows windows.
- Snap 8px to stage edges/centre and other windows' edges, centres and 14px gaps; guides and
  an `X/Y` / `W × H` readout while dragging.
- Docks: two rails, drag between and within them; system widgets are unique per `(type, svc)`,
  NOX widgets are not; pinning something already docked flashes it.
- Pin flow: pending card + scrim, drag to a rail, cancel with ✕ / scrim / `Esc`.

## v9 additions (workspace chip, settings window, task card, mic rework)

From `NIX v9.dc.html`. These supersede the matching "Additions not in the prototype" paragraphs below as
each lands; an item marked *ours* is a project decision the design does not draw.

### Warning token

`--nx-wn` (RGB triplet): the amber for "NOX is busy and can be stopped" and for thinking tints.
Dark `255,205,80`, light `168,112,0`. It replaces the hard-coded `255,205,80`; offline stays `#ff6b8a`.

### Shadow opacity token

`--nx-so` multiplies the opacity of every shadow (`rgba(sh, calc(a * var(--nx-so)))`: widgets, windows,
panels, ghost, pending card and scrim, mic, task card, code blocks). `1` on dark variants, `.32` on light
ones, where a shadow tuned for a dark field is far too heavy.

### Header collapse

Below 1180px wide the host is dropped, below 980px `SVC n/m` too, and below 760px the side padding is 0
(otherwise 250px, to stay clear of the two top pills).

### Workspace chip and panel (top-left)

Chip at `top:12; left:20`, h30, glass pill (`pn/.55`, blur 14, radius 8, 1px border `ac/.25`, `ac/.65` while open):
`◇  WS·01  Name  1/3  ▾` (diamond 5px rotated; code mono 9.5 `.18em`; name 12.5/500 max 180px ellipsised,
re-entering with `nxSub` when it changes; count mono 9; chevron rotates 180° with an overshoot ease).

Panel under it, 330px wide, glass (`pn/.9→.95`, blur 18, radius 14), `nxIn` from the top left plus a one-off
`nxSweep` and a glowing top line. Header `WORKSPACES ───── ⌥1–9`. One row per workspace (grid `58px 1fr auto`,
radius 10, active row `mu/.12` with an `ac/.5` border): a **58×38 layout thumbnail** (1px `ac/.28` border,
left and right rail blocks 9px wide, window outlines in two columns in the middle, an empty workspace shows
a glowing 9px circle), name 13.5/500, mono meta (`3 WINDOWS · 2 WIDGETS`) and a tag (`ACTIVE`). Click
switches; double-click the name renames in place (Enter or blur commits, Esc cancels, 28 chars). Footer: a
dashed `+ NEW WORKSPACE` that becomes a name field + `CREATE` + `✕`, then the hint
`DOUBLE-CLICK TO RENAME · , SETTINGS`. Keys: `W` toggles, `⌥1–9` jumps, Esc closes.

**Switch**: the panel closes, the core blurs and dims, a banner at `top: calc(46% - 60px)` shows
`WORKSPACE 02` (mono 10, `.34em`) over the name (Instrument Serif 64px) and a 240px drawn underline
(`nxBar`); it fades out (`nxFade`) about 1s later. On first load the label reads `BOOTING · WORKSPACE`.
The layout is snapshotted before leaving and restored after, in place, without a page load.

### Settings button and window

Button top-right (`top:12; right:20`), same pill as the chip: three horizontal lines with square knobs that
slide when the window is open (positions 1/7/3px → 9/1/6px, overshoot ease, staggered .05s), label
`SETTINGS` mono 9.5 `.18em`. It toggles the `settings` **module window** (it goes through the window
system; it is not on the bottom dock). `,` opens it.

Window body, one column, max 680px, sections each led by `◇ NN · TITLE ────`:
a `SCOPE · Saved to workspace "X" · ● AUTOSAVE` strip; `01 APPEARANCE` (mode segmented control with a
sliding thumb, palette cards with a dark and a light preview); `02 DOCK` (rows: number, label, code,
↑ ↓, on/off switch; Core stays on; number keys follow the order); `03 CORE` (strands slider 16–80 step 4,
grid switch); `04 WORKSPACE` (name field, `DUPLICATE`, `RESET SETTINGS`, `DELETE` which asks for a second
click within 3s and is disabled with a single workspace). *Ours:* `05 SERVICES` (retire/restore),
`06 LAYOUT` (`Auto` / `Side rails` / `Top and bottom`), `07 DEVICE` (orb quality, per device), same style.

Per workspace: theme, palette, grid, strands, dock order and hidden modules, and our layout and retired services.

### Task card (background tasks)

Centred card (`left:50%`, z 9) under the orb at `top: min(calc(38% + 30vmin + 18px), calc(100% - 300px))`
when the viewport is at least 720px tall and the stage is empty (**tall**); otherwise **compact**, sitting
`bottom:100px`. Width `max(260px, min(500px | 560px, 100% - 2 × rail - 120px))`. Glass, radius 14, top glow
line, a slow `nxSweep` while running, two `nxFlash` pulses on completion, entry `nxIn` + `nxEdge`, exit `nxClose`.

Rows: (1) a mono 9.5 header: pulsing diamond, `NOX · WORKING` (`NOX · COMPLETE` when done), a line,
`STEP 02/04`, elapsed `mm:ss` in `fg`, `−`/`+` minimise, `✕` stop (22px square buttons); (2) the title in
Instrument Serif (23px tall, 17px compact) and, when compact or minimised, `→ current step` in mono 10;
(3) the body, which collapses with `grid-template-rows 1fr→0fr`, blur and a -8px lift: a row of one 3px
**segment per step** (filled in `ac` with a glow; the active one fills by elapsed time against the step's
expected duration, capped at 97%, and carries a moving highlight), and in tall mode the **step list**:
16px icon / label 13px / result mono 9.5. Done = filled square with `✓` (`nxLand`), active = ringed dot with
`nxFlash` and an `nxPing` ring, todo = dashed square. Done labels `fg/.55`, active `fg`, todo `ac/.55`.

The segments carry no expected duration (a worker does not know it): a done step is full, the active one
is an empty track with the moving highlight, and the orb's ring advances by the share of steps done. The header
chip `● N TASKS` stays as the way to reach a task whose card is not shown (several tasks, or none
visible on the stage).

### Agent state WORKING

A fifth active state. Label `WORKING` (`fg`), orb: a **72-tick progress ring** at `1.3R` (lit up to the
progress, a bright head orbiting at .3 turns/s, long ticks every 6th), two counter-rotating arcs at
`1.2R` and a glowing head sprite at the progress point. Mic: the ring head is slower and bars behind the
progress stay lit. It lasts while a task runs; speaking and listening take precedence and the mode returns to
`WORKING` or `STANDBY` after them.

| State | Orb | Label | Mic |
|---|---|---|---|
| working | progress ring | `WORKING` (`fg`) | amber halt button |

### Mic button (replaces "Mic button" above)

A 72px box holds the 56px button (`inset:8px`) and a **140px canvas** offset -34px, pointer-events none.
Button: radius 50%, glass (`pn/.86→.94`, blur 18), 1px border in the state colour, glow
`0 0 <blur> <halo>`, scale 1.06 while listening, `.9` on press; a dashed inner ring (`inset:5px`, `ac/.14`).

Canvas: 56 radial bars from radius 36, length `2 + v·16`, line 1.6, round caps, each eased toward a
target at .25 per frame, plus a faint circle at radius 60 with one orbiting dot (two while listening).
Targets: idle `.06 + .05·sin(1.4t + .45j)`; listening `.12 + mic·(.35 + .65|sin(1.7j + 9t)|)·(.55 + .45 sin(.9j - 5t))`;
speaking `.1 + amp·.9·|sin(3τf + 4t)|`; thinking/working `.08` with a bright head sweeping (1.3 / .45 turns/s).
Alpha `.2 + v·1.1`; bars above `v>.3` use colour B, the rest A.

Glyphs (each enters with `nxLand`): microphone (capsule with two level ticks, cradle, stem), **stop** (13px
rounded square, while listening), **three blinking dots** (thinking: sending), **halt** (18px framed square
with an `nxPing` ring, while busy), **halted** (16×2 bar, for 1.6s after a halt).

Halt: while thinking, speaking or working the button is the amber `--nx-wn` stop for NOX; one tap cancels
speech, the running task and a pending pin and logs `agent halted by operator`; the canvas fires an expanding
amber circle (900ms) and dims the bars. Tooltips: `Talk` / `Stop & send` / `Stop NOX (esc)`.

There is no text under the button; the state shows in the glyph, the ring and the tooltip.
Tapping while listening **sends**; Esc drops the recording.

## v10 additions (calendar)

A `calendar` dock module (appended after Cameras) with its own window, and a `cal` dock widget. Source:
`NIX v10.dc.html` (`calVals`, `wItem` for the widget).

### Calendar colour

Each source (a calendar) has a hue; `calTone`: `color oklch(0.78 0.12 hue)`, fill `oklch(0.78 0.12 hue / .16)`,
line `oklch(0.78 0.12 hue / .6)`. A source without a hue uses the accent (`ac`, fill `.12`, line `.5`).

### Calendar window

Two columns when wide (`214px minmax(0,1fr)`), one when narrow (the side column goes away).

- **Side column.** Month mini-calendar: label (`MONTH YYYY`, mono 9, `.18em`), `‹ ›` buttons, weekday letters
  `M T W T F S S`, day cells (today filled `ac` with `pn` text, the visible range tinted `mu/.16`, a dot under days
  with events, days outside the month at `ac/.3`). Under it `SOURCES` with a count `x/y`: one row per calendar
  with a swatch (glows in its colour when on, empty when hidden), name, `GOOGLE · account` and a status
  (`SYNCING` blinking `fg`, `SYNCED`, `HIDDEN`) on the right; a click toggles it, hidden rows sit at `.5`
  opacity. Last, a dashed `+ CONNECT CALENDAR` button (the prototype opens a provider chooser; the build has only
  Google, so it goes straight to the sign-in).
- **Toolbar.** Range kicker (`TODAY · 04 EVENTS` in day view, `WEEK 41 · 2026 · 23 EVENTS` in week view) and label,
  `‹ TODAY ›`, and a `DAY / WEEK / AGENDA` segmented control.
- **Grid (day, week).** Header cells `MON / 07` with a dot on today; a timezone label in the corner. Hours 06-24,
  44px each, the current hour scrolled into view. Events are absolute blocks (fill and 1px line in the calendar's
  tone, title mono 11, the time range when at least 40 minutes tall, minimum height 20px); overlapping events share
  the width in lanes; past events at `.5` opacity; the selected one gets a `fg` ring and glow; hover lifts it 1px.
  A now-line crosses today's column.
- **Agenda.** One block per day of the week: a head `MON 07 OCT · TODAY` with the count, then rows
  `time · swatch · title / place · tag`, the tag being `NOW` for a live event and the calendar name otherwise;
  `Nothing scheduled.` for an empty day.
- **Selected event.** A card with the calendar's colour bar, `NAME · PROVIDER`, relative time (`NOW`, `IN 25M`,
  `IN 2H 05M`, `IN 3D`, `ENDED`), the title, a `WHEN / LENGTH / WHERE` list and two buttons: `JOIN CALL` (only with a
  conference link) and `OPEN IN <PROVIDER> ↗`.
- **Footer.** `N EVENTS THIS WEEK · x/y CALENDARS`.

### Calendar widget (`cal`)

Kicker `CALENDAR · NN LEFT TODAY`. The current event (`NOW`, `NNM LEFT`, blinking dot) or the next one (`NEXT`,
`IN …`) with its time and place and, when live, a progress bar; a day strip (07-23h) with each event a segment in
its colour (past ones `.3`) and a now marker; up to four more events as `time · swatch · title`; and
`Clear for the rest of today. Tomorrow opens at HH:MM with Title.` when nothing is left. Clicking opens the window.
A system widget, one per workspace, seeded once on first load.

### As built (not in the prototype)

- **All-day events** are chips like any other, in a strip between the day headers and the grid (20px high, in the
  calendar's tone), repeated on every day they cover; in the agenda the time reads `ALL DAY`.
- **`PENDING`** is a fourth source status (warning token `--nx-wn`) for an account whose sign-in expired; clicking
  the row signs in again instead of toggling.
- **Same invitation in two accounts** is shown once.
- The window is read-only: events are created, changed and deleted by asking NOX.

## Additions not in the prototype

Decided for the project; drawn from the design's own tokens, kept minimal.

- **Workspaces**: the chip and panel of the v9 additions. A new workspace starts with the **default
  workspace's theme** and nothing else. A name that already exists, ignoring case, is refused inline
  (`ALREADY EXISTS`; the server refuses it too, and a name that would make the id of another one); renaming
  keeps the id. The address follows the workspace on screen (`?workspace=<id>`, the default one when there is
  none) so a reload stays on it; nothing is remembered between tabs. Typing in a field does not trigger the
  keyboard shortcuts; Esc closes the panel. The server keeps them in the order they were made, which is the
  order of `⌥1–9`; the default one cannot be deleted.
- **Settings** (the v9 window) has three sections the design does not draw, in its style: `05 SERVICES`
  (retire a service: it leaves the Services window, the dock widget and the header count; replaces the
  prototype's "edit nix.config.json" footnote), `06 LAYOUT` (`Auto` / `Side` / `Stacked`, stored with the
  workspace) and `07 DEVICE` (orb quality `High` / `Low` and sound effects, kept on the device: Low draws half
  the strands, drops the wide glow and renders at 1x, for the tablet and the Echo Show tiers). With the Blue
  palette (a single, dark variant) the mode choice is locked to `Auto`. Hiding a dock module closes its window
  and the 1-9 shortcuts count what is left.
- **Voice input is feature-detected**: if the page is not in a secure context (no HTTPS) or the browser has
  no recorder, the mic button is dimmed and does nothing, and NOX remains reachable through the dev CLI
  (see architecture). The mic button and a click on the orb start and stop listening, and
  `Esc` drops a recording, or stops NOX when it is busy.

## Out of scope for now

Touch adaptations (larger hit areas on handles and window buttons, pressed states in place of
hover, double-tap to maximise, audio unlock on first tap), runtime quality tiers for weak
screens, and the Echo Show / Android tablet targets. The data model already avoids anything that
would block them (fractional geometry, feature-detected voice, isolated effects).

## v12 addition: CarPlay layout

A workspace with the CarPlay option on (Settings → Layout; the workspace with id `carplay` starts with it on) shows
a touch-first layout made for a phone running Meridian in a car. The prototype is `NIX v12.dc.html` (`cpL`, `cpTile`
and the bar markup); the code is in `apps/web/src/lib/shell/car-*`. The option also starts the voice options in
their car defaults, see [`carplay.md`](carplay.md).

### Shell

No header, no floating rails, no bottom dock, no separate mic button. The core on the left, a column of tiles on
the right, a bar along the bottom. All sizes come from `car-layout.ts` (a port of `cpL`):

- **Bar:** 12 px from the left, right and bottom edges; 64 px tall under 560 px of screen height, else 76 px. A
  square workspace button (diamond and the workspace code, opens the workspace list above it), the dock modules as
  large buttons (the core is HOME; the active one has a filled pill and an underline), and a square settings button.
- **Tiles:** from the top-right corner down to 24 px above the bar. One column 240-380 px wide (36% of the width);
  two columns up to 680 px on a screen wider than 2.1 times its height and 1100 px, with 4 tiles or more. Rows
  share the height, at least 100 px (84 px on a low screen, where the tiles are tighter), and scroll if they do not
  fit. Tiles are hidden while a window is open, and fade and blur while a workspace switch plays.
- **Core:** centred in what the tiles leave, radius a quarter of the smaller side of that zone (56 px at least). A
  dashed ring 2.5 radii wide is the talk button; its colour follows the state (listening: accent, stoppable or
  halted: warning, otherwise faint). The hint under it says what a tap does: `TAP TO TALK`, `00:07 · TAP TO SEND`,
  `SENDING · TAP TO STOP`, `TAP TO STOP NOX`, `NOX HALTED`, `BOOTING`. The state label sits above it, centred in the
  same zone, and the task card compact above the bar.
- **Windows:** one at a time, over the whole stage above the bar; opening one closes the others.
- **Pins:** there is no rail to drop a card on, so a pin becomes the last tile at once.

### Tiles

A card with a kicker and a status dot, a big value with a unit, a sub line and an optional thin bar; a tap opens the
window it stands for. Built-in widgets: telemetry (CPU, memory and temperature, red above 70 °C), services (online
of total, degraded before offline), events (alerts and the latest message), documents (title). A service describes
its own through `ServiceWidget.tile` (a `watch` to start what feeds it and a `read` that returns a `WidgetTile`)
and says what a tap opens with `opens`; without it the tile shows the widget's title and kicker. Calendar:
`NOW` / `NEXT · 15:00`, the title, time left or how far off, a progress bar for the current event in its calendar's
colour. Feeder: the last feeding and the hopper (the design shows the next one; the device's schedule is not
decoded yet).

### Starting state

Turning the option on, or opening a workspace in CarPlay mode that never saved it, docks the tiles services offer
(left rail) plus services and telemetry (right rail), sets the dark theme and 24 strands, only when the dock was
never arranged (empty, or just the telemetry widget a new workspace has).
