# devices

Lets NOX act on the owner's own machines: the browsers and desktop apps on a PC, with the owner's accounts and
settings as they already are. The brain stays on this server; a device only runs what it is told.

Status: browsers work (a Chromium browser, any number of profiles), and desktop apps that run in a WebView2 (anywh first) and the Rust executor for whole machines (Windows first).

## What exists

| Piece | What it does |
|---|---|
| `server/store.ts` | SQLite tables in the core's `meridian.db`: devices, one-use pairing links (5 minutes), executor public keys. Secrets are stored as SHA-256 hashes only |
| `server/audit.ts` | One line per call in `~/.meridian/devices/audit.log` (mode `0600`): time, device, tool, host and path, outcome. A query string or fragment is cut before writing |
| `server/kill-switch.ts` | Closes every device socket and refuses new ones until the owner turns it off. Survives a restart |
| `server/policy.ts` | Three tiers: `observe` never asks, `act` asks only when the call looks risky, `irreversible` always asks. Anything read from a page or screen is returned marked as untrusted data |

## Browsers

NOX drives the owner's own browser profiles, signed in as they already are, through the
[BrowserSkill](https://github.com/Tencent/BrowserSkill) extension. Only its extension runs on the PC; this service
speaks its wire protocol (1.3) from the server side, so there is no third-party daemon and nothing hosted.

**Pinned.** Commit `63c1657`, built from source and loaded unpacked (no store install, so nothing updates by
itself). The wire schemas the gateway speaks are copied in `server/browser/schemas/` with the MIT notice, and a
test validates every frame we send against them. When the extension moves to a newer commit, re-copy the schemas,
re-run the tests and update this pin together.

**Pair a profile.** Ask NOX to pair a browser (the owner confirms). It shows a one-use link, valid 5 minutes. In the
profile's BrowserSkill popup choose Remote connection, paste the link, and set the profile label (`personal`,
`work`): that label is what NOX uses to pick the browser. The extension swaps the link for its own credential;
the server keeps only a hash of it (90 days, renewed by the extension after 30).

**Address.** The extension needs `wss://`. Behind the production TLS front (tailscale serve to Caddy) the link carries
`wss://<host>/api/services/devices/extension`; set `MERIDIAN_DEVICES_PUBLIC_URL` to that. A dev server on port 4100
can be fronted with `tailscale serve --bg --https=10000 http://127.0.0.1:4100`, which passes the WebSocket upgrade and
the `Sec-WebSocket-Protocol` credential through untouched (checked).

**Revoke.** `device_revoke` with the device id from `status`: the socket closes at once and the credential stops
working. A device that lapses or is revoked elsewhere is cut within a second by a sweep. The kill switch cuts all.

**What NOX does with it.** `browser_open`, `browser_read`, `browser_find`, `browser_links`, `browser_click`,
`browser_type`, `browser_press`, `browser_wait`, `browser_close`, `browser_status`.

- *Background by default.* A session opens in a window of its own that does not take the focus. Foreground is for when
  the owner wants to watch.
- *Few tokens.* A read is capped at about 1500 tokens, with a cursor for the rest. Page outlines lose their CSS
  annotations, repeated text and empty wrappers. `find` and `links` run a small script in the page and return a few
  lines. Actions answer in one line and do not re-read the page; an unchanged page answers "no change".
- *Policy.* A per-profile domain allowlist (https only), checked before and after every step. Risky clicks and Enter in
  a form ask the owner on screen (the rules come from the former `browser-harness` service). Typing never submits, and
  password, code and card fields are refused. A page text is returned marked as data, never instructions.
- *Audit.* One line per call, host and path only.

Limits worth knowing: a click by ref is judged from the outline (role, label, whether it sits in a form or dialog), so a
button inside a form counts as a submit and asks; the extension shows the "being debugged" bar on controlled tabs;
file upload and download are not available in remote mode.

## Desktop apps (WebView2 debug port)

An app built on WebView2, such as the anywh desktop client on Windows, can be driven like a web page: started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` it exposes its window over the Chrome
DevTools Protocol, on the PC's loopback. No change to the app is needed. WKWebView on macOS has no such protocol, so
a Mac build needs another route (commands the app exposes itself); that is a stop-and-propose point, not something to
build around.

- **Setup.** `MERIDIAN_DEVICES_APPS=anywh=9223` lists the apps (`id=port`, one entry each, nothing in the code names
  an app) and `MERIDIAN_DEVICES_APPS_SSH_HOST=win-lan` names the ssh host of the PC. The server opens an `ssh -N -L`
  tunnel to the port on demand, drops it after ten quiet minutes, and the kill switch drops it at once. The owner
  starts the app with the debug option; when the port is closed the answer says exactly that, and NOX does not try
  another way.
- **Tools.** `app_status`, `app_read` (a few hundred characters: headings and controls with refs like `@a3`),
  `app_click` (a real mouse click through `Input.dispatchMouseEvent`), `app_type` (text into a field, never submits;
  password, code and card fields are refused) and `app_wait` (text or a selector, at most 15 s). The refs live on
  `window.__nox` in the page, nothing is written into the app's DOM, and a connection is opened per call.
- **Policy.** Reading is free. A click that could send, delete, buy, accept, save or change something asks the owner
  on screen, with the same rules as the browser, and nothing happens if they decline. What the app shows (including
  what an agent wrote in it) is returned marked as data. The audit log records the app and the outcome only. The
  anywh relay tools remain the way to read and create sessions; this is for the app's own screen.

## Devices: the executor

`executor/` is a small Rust program that runs on the owner's PC (see its README to build and install it). It dials this
server over the tailnet, proves it holds its private key, checks the server's pinned public key, and announces what
it can do: windows, processes, the clipboard, opening a file or link, a notification, a screenshot. The server never
hard-codes a capability: `device_list` shows what each device announced, `device_describe` the inputs, and
`device_call` runs one.

- **Tiers decide when the owner is asked.** `observe` runs freely and its answer comes back marked as data (window
  titles and the clipboard were written by others). `act` runs freely. `irreversible` (killing a process) always asks
  on screen, and nothing is sent to the PC if the owner declines. Input is checked against the schema the device
  announced before anything is sent.
- **Enrolling.** `device_enroll` gives the address and the server's public key; the executor pins that key. The first
  time a new device connects it waits: `device_approve` (asks on screen) lets it in. `device_revoke` removes a browser
  or an executor for good, and the executor stops trying.
- **Screenshots** are a separate, explicit tool: the PNG is saved under `~/.meridian/devices/screens` (mode `0600`, the
  latest 20 only) and NOX gets the path, not the bytes.
- The server key is `~/.meridian/devices/server-key.json` (mode `0600`). Replace it and every executor must be given
  the new public key.

## NOX's tools

| Action | What it does |
|---|---|
| `status` | Paired devices (connected or not) and whether the kill switch is on |
| `device_list`, `device_describe`, `device_call` | The owner's machines with an executor: what each can do, the inputs, and running one capability |
| `device_enroll`, `device_approve`, `device_revoke` | Add an executor (the server key to pin), let a waiting one in, and remove a browser or an executor |
| `kill` | Kill switch on. Never asks first, so the owner can say "stop" and it happens |
| `resume` | Kill switch off. The owner confirms |

## Environment

| Variable | Meaning |
|---|---|
| `MERIDIAN_DATA_DIR` | Shared with the core: where the database and the audit log live. Default `~/.meridian`. Point it at a scratch directory when running a dev server |
| `MERIDIAN_DEVICES_PUBLIC_URL` | The `wss://` address a pairing link carries. Required to pair |
| `MERIDIAN_DEVICES_APPS` | Desktop apps reachable through a WebView2 debug port, `id=port,id=port`. Default: none |
| `MERIDIAN_DEVICES_APPS_SSH_HOST` | The ssh host (from `~/.ssh/config`) of the PC that runs the apps; the tunnel goes there |
| `MERIDIAN_DEVICES_BROWSER_ALLOWED_DOMAINS` | `personal=youtube.com,example.com;work=*`, with `*=` as the fallback. Default: every https host |

## Open items

- **The work profile is not paired.** Before it is, check the BrowserSkill extension's own network traffic (the
  service worker's Network panel in `brave://extensions`): it may only talk to this server. The static audit of the
  pinned commit found no third-party host, but reading is not proof, and the work profile holds more.
- **macOS has no executor yet.** It needs a `cfg(target_os = "macos")` module behind the same capability names (and a
  Keychain key store in place of DPAPI); the owner grants Accessibility and Screen Recording by hand once. The
  anywh client on macOS runs in a WKWebView, which has no debug protocol: that needs commands the app exposes itself.
  Both are described in `executor/README.md`.
- **Browser allowlist** defaults to every https host. Narrow it per profile with
  `MERIDIAN_DEVICES_BROWSER_ALLOWED_DOMAINS` once the sites NOX should reach are settled.
- **The extension is pinned** at BrowserSkill `63c1657`, loaded unpacked from a folder on the PC. Moving it to a newer
  commit means re-copying the wire schemas (`server/browser/schemas/`), re-running the tests, and loading the new
  build by hand; nothing updates it silently.
