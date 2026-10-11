# devices

Lets NOX act on the owner's own machines: the browsers and desktop apps on a PC, with the owner's accounts and
settings as they already are. The brain stays on this server; a device only runs what it is told.

Status: foundation only. No device can connect yet, so the service shows as "standing by".

## What exists

| Piece | What it does |
|---|---|
| `server/store.ts` | SQLite tables in the core's `meridian.db`: devices, one-use pairing links (5 minutes), executor public keys. Secrets are stored as SHA-256 hashes only |
| `server/audit.ts` | One line per call in `~/.meridian/devices/audit.log` (mode `0600`): time, device, tool, host and path, outcome. A query string or fragment is cut before writing |
| `server/kill-switch.ts` | Closes every device socket and refuses new ones until the owner turns it off. Survives a restart |
| `server/policy.ts` | Three tiers: `observe` never asks, `act` asks only when the call looks risky, `irreversible` always asks. Anything read from a page or screen is returned marked as untrusted data |

## NOX's tools

| Action | What it does |
|---|---|
| `status` | Paired devices and whether the kill switch is on |
| `kill` | Kill switch on. Never asks first, so the owner can say "stop" and it happens |
| `resume` | Kill switch off. The owner confirms |

## Environment

`MERIDIAN_DATA_DIR` (shared with the core) decides where the database and the audit log live; the default is
`~/.meridian`. Point it at a scratch directory when running a dev server.
