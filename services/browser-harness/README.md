# browser-harness

Lets NOX operate a Chrome the owner is already signed in to, for sites that have no API and no MCP (first target:
the App Store Connect Resolution Center, which Apple's API does not expose). A real, signed-in browser also avoids
the blocks crawlers meet.

It is built on [browser-harness](https://github.com/browser-use/browser-harness) (MIT, pinned in
`gateway/requirements.txt`), but Meridian never hands that library to NOX: it gives its caller arbitrary
JavaScript and raw CDP, which can read cookies and click anything. `gateway/gateway.py` is the only thing the
service runs. It offers a small set of generic primitives and puts the policy around each one, so the agent decides
*where* to act and the gateway decides *whether it may*.

## What NOX can do

Ordinary `service_browser-harness_<action>` tools, so there is no script to write per request.

| Action | What it does |
|---|---|
| `open {url}` | Go to an `https` URL on the allowlist. `signed out` in the answer means the owner has to sign in |
| `snapshot {viewportOnly?, max?}` | An outline: headings and every control (button, link, field, tab, switch), each with a `ref` like `k7-12`, open dialogs, the scroll position |
| `read {offset?, maxChars?, includeHidden?}` | The page text, about 6000 characters at a time (`offset` to continue); `includeHidden` adds collapsed sections such as a message thread |
| `links` | The links to allowed domains, as text and address |
| `click {ref \| text \| selector \| x,y, role?, nth?}` | A real click. Several matches come back as a list to choose from (`ref` or `nth`) |
| `type {text, ref \| field \| selector \| x,y, clear?}` | Types into a field; never submits |
| `press {key}` | Enter, Tab, Escape, Space, arrows, PageUp/Down, Home, End, Backspace, Delete. No shortcuts |
| `scroll {direction? amount? \| ref \| text}` | Scroll, or bring a control into view |
| `wait {text \| selector, gone?, seconds?}` | Wait for something to appear (or go), up to 15 s |
| `back`, `forward`, `tabs {action, id}`, `screenshot`, `status` | Navigation, tabs on allowed domains, a PNG saved on this machine, and whether Chrome answers |

Results are short text, not JSON, so they read well in a turn. For long text the persona tells NOX to say the gist
and put the rest on screen with `compose_doc`.

## Guardrails

- **Allowlist** (`MERIDIAN_BROWSER_ALLOWED_DOMAINS`, default `appstoreconnect.apple.com`; a host matches itself and
  its subdomains; `https` only). Checked on the page before every step and again after: a link to another domain is
  refused before it is clicked, a tab that opens on another domain is closed (one on an allowed domain is followed),
  a page that wandered off is sent back. A sign-in page is reported, never touched.
- **Risk is decided per call, from the element the click will actually land on** (`gateway/policy.py`, unit-tested).
  Reading, navigating, opening menus and tabs are free. It asks the owner on screen first when the label says
  send, publish, delete, buy, accept, save, change, sign out... (English and Portuguese), when it is a submit
  button of a form, a switch or checkbox, a confirming button in a dialog, a link whose address looks destructive,
  or Enter inside a form that is not a search. Cancel, Close and the like are free. When unsure, it asks. The
  card says what: `Browser: click button "Resubmit to App Review" on appstoreconnect.apple.com/apps/…`.
  This is a heuristic: it errs toward asking, and the allowlist plus the owner's card are what stand behind it.
- **The agent cannot confirm for itself.** The gateway refuses a risky call unless it carries an HMAC seal of that
  exact element and page, made with a key that exists only in the server process and reaches the gateway over its
  stdin. A REST caller with no screen is told no. Typing never submits, and password, one-time-code and card
  fields are refused outright: the owner fills those.
- **Nothing sensitive leaves.** No operation returns cookies, storage or headers; page text has bearer tokens and
  long token-like strings replaced with `[redacted]`; the audit log (`~/.meridian/browser-harness/audit.log`, mode
  `0600`) has one line per call with host and path only: no query string, no page text, no typed text.
- **Harness hardened.** Telemetry, update check and recordings are off, the cloud is never used, only
  `MERIDIAN_BROWSER_CDP_URL` is accepted, and the gateway checks the debug port before importing the harness (which
  would otherwise start a Chrome of its own). The server hands the gateway a minimal environment.

What this is not: a security boundary against a process that can already run commands on this machine. The debug
port listens on loopback, so anything local, NOX's Bash included, could speak CDP to it and skip all of the above.
NOX's persona and the auto mode classifier forbid that, which is a guard-rail. The real protection is that the
Chrome profile holds only the sessions the owner chose to put there, and that the allowlist and the owner's card
sit on the only path NOX is meant to use. Text on an allowed page is returned as it is, so the allowlist is also a
statement of what NOX may read; page text is told to NOX as untrusted data.

Not handled yet: native `alert`/`confirm` dialogs, file upload and download, native `<select>` menus, signing in
(left to the owner; a password manager integration can come later), iframes in other origins.

## Setup

1. **Python side** (once): `services/browser-harness/scripts/setup.sh` makes `.venv` with the pinned harness.
2. **Chrome side** (Windows): copy `scripts/start-chrome-debug.bat` to the machine and run it from the desktop (an
   SSH session is not the desktop, so Chrome started from there would be invisible). It opens a **separate
   profile** with the debug port on loopback only. Since Chrome 136, `--remote-debugging-port` is ignored on the
   default profile ([Chrome's note](https://developer.chrome.com/blog/remote-debugging-port)), so the owner signs
   in to the sites once in that window, 2FA included; do not sign in to Chrome with a Google account there. The
   session stays in the profile. macOS is the same with `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
   and a `--user-data-dir` under `~/Library/Application Support/Meridian/`.
3. **Tunnel**: `MERIDIAN_BROWSER_SSH_HOST=<ssh host> services/browser-harness/scripts/tunnel.sh`, left running. It
   forwards the port to `127.0.0.1:9222` here.
4. Restart the server. `browser-harness` shows up in the Services window, online while the port answers. NOX's
   tools for it appear at its next start (its persona changed, so it starts a fresh conversation).

Configuration is in `.env.example` (`MERIDIAN_BROWSER_*`).

## Tests

- `python -m unittest` in `gateway/` (with the service's `.venv`): the policy: allowlist, risk classification in
  both languages, keys, typing, the seal.
- `gateway/e2e/run_e2e.sh`: starts a local HTTPS test site with every trap (risky buttons, an outside link, a popup,
  POST and search forms, a password field, a dialog, a switch, a collapsed thread) and a headless Chrome, then
  drives the gateway the way the server does, plus the server's half (`run_ts.mts`, Node 22+) to prove the seal the
  server makes is the one the gateway accepts. It needs `google-chrome` and `openssl`.

Not tested against App Store Connect itself beyond the read-only POC (opening the Resolution Center and reading
it); the new primitives have only run against the local test site.
