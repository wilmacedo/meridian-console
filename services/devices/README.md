# devices

Lets NOX act on the owner's own machines: the browsers and desktop apps on a PC, with the owner's accounts and
settings as they already are. The brain stays on this server; a device only runs what it is told.

Status: the browser path works (a Chromium browser, any number of profiles). Desktop apps and the executor are not built yet.

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

**Revoke.** `browser_revoke` with the device id from `status`: the socket closes at once and the credential stops
working. A device that lapses or is revoked elsewhere is cut within a second by a sweep. The kill switch cuts all.

**What NOX does with it.** `browser_open`, `browser_read`, `browser_find`, `browser_links`, `browser_click`,
`browser_type`, `browser_press`, `browser_wait`, `browser_close`, `browser_status`.

- *Background by default.* A session opens in a window of its own that does not take the focus. Foreground is for when
  the owner wants to watch.
- *Few tokens.* A read is capped at about 1500 tokens, with a cursor for the rest. Page outlines lose their CSS
  annotations, repeated text and empty wrappers. `find` and `links` run a small script in the page and return a few
  lines. Actions answer in one line and do not re-read the page; an unchanged page answers "no change".
- *Policy.* A per-profile domain allowlist (https only), checked before and after every step. Risky clicks and Enter in
  a form ask the owner on screen (the rules are ported from `services/browser-harness`). Typing never submits, and
  password, code and card fields are refused. A page text is returned marked as data, never instructions.
- *Audit.* One line per call, host and path only.

Limits worth knowing: a click by ref is judged from the outline (role, label, whether it sits in a form or dialog), so a
button inside a form counts as a submit and asks; the extension shows the "being debugged" bar on controlled tabs;
file upload and download are not available in remote mode.

## NOX's tools

| Action | What it does |
|---|---|
| `status` | Paired devices (connected or not) and whether the kill switch is on |
| `kill` | Kill switch on. Never asks first, so the owner can say "stop" and it happens |
| `resume` | Kill switch off. The owner confirms |

## Environment

| Variable | Meaning |
|---|---|
| `MERIDIAN_DATA_DIR` | Shared with the core: where the database and the audit log live. Default `~/.meridian`. Point it at a scratch directory when running a dev server |
| `MERIDIAN_DEVICES_PUBLIC_URL` | The `wss://` address a pairing link carries. Required to pair |
| `MERIDIAN_DEVICES_BROWSER_ALLOWED_DOMAINS` | `personal=youtube.com,example.com;work=*`, with `*=` as the fallback. Default: every https host |
