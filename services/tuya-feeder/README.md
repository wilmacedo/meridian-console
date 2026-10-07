# tuya-feeder service

A Meridian service for Tuya/SmartLife devices, starting with an automatic pet feeder with a camera: it
exposes the feeder through the server (`server/`), contributes the Cameras window and a feeder dock
widget (`web/`) and ships the notes below. See `docs/services.md` for the service contract.

Anything specific to one installation (device IDs and names, observed readings, schedules) does not
belong here: keep it in `docs/local/` at the repo root, which is git-ignored.

## Context

- The devices are **Tuya**, managed by the **SmartLife** app.
- Access goes through the **Tuya Cloud OpenAPI**, using a cloud project created on iot.tuya.com (your own
  developer account) with the SmartLife account linked to the project by QR code. Without that project
  there is no API: the app login does not yield credentials.
- Credentials live in the repo-root `.env` (copied from `.env.example`, git-ignored): `TUYA_ACCESS_ID`,
  `TUYA_ACCESS_SECRET`, `TUYA_API_ENDPOINT` (the data center chosen when creating the project; the
  options are listed in `.env.example`). **Never paste secret values into a reply, commit or log.** A
  device's `local_key` is a secret too.
- Node 20.6+ (`--env-file` and native `fetch`). Scripts are TypeScript run through `tsx`; from the repo
  root: `pnpm tuya scripts/<script>.ts [args]`.

## Scripts

All in `services/tuya-feeder/scripts/`.

| Script | Purpose |
|---|---|
| `check.ts` | Validates credentials (token + device list call) |
| `devices.ts` | Lists the devices of the linked account; this is where you get your device IDs |
| `inspect.ts <id>` | `/specifications` and `/status` (standard API) |
| `shadow.ts <id>` | Shadow properties, model and device details (**prints `local_key`, `ip`, `uid` — never paste the output**) |
| `model.ts <id>` | Readable table of the feeder-specific DPs (descriptions are in Chinese, straight from Tuya) |
| `feed.ts <id> <portions>` | Feeds and reads the result back. **Actually dispenses food — confirm before running** |
| `stream.ts <id> [type]` | Allocates a camera stream (`RTSP` works; `HLS` only yields a spinner; `FLV`/`RTMP` untested). Prints only whether a URL came back; `SHOW_URL=1` prints it |
| `snap.ts <id> [file]` | Captures a frame from the RTSP stream with `ffmpeg` (see "Camera" below) |

The API client itself is `services/tuya-feeder/server/tuya-client.ts`: HMAC-SHA256 signing and a cached token.

## Feeder — findings

These were found on one specific feeder model (category `sp`, a pet feeder with a camera); other models may
use different data points.

### The standard API is not enough; use the shadow

`/v1.0/devices/{id}/specifications` and `/status` only expose camera functions (LED, night vision, motion
sensitivity, volume, restart). The feeding DPs **do not show up there**. They show up in:

- `GET /v2.0/cloud/thing/{id}/shadow/properties` — current values of every DP (accepts `?codes=a,b,c`)
- `GET /v2.0/cloud/thing/{id}/model` — DP definitions (JSON inside a string at `result.model`)

### Sending a command

`POST /v2.0/cloud/thing/{id}/shadow/properties/issue` with body `{"properties": "{\"feed_publish\": 1}"}` —
note that `properties` is a **JSON string**, not an object. A 1-portion feeding physically dispensed food
and the device reported back in ~4s. `/v1.0/devices/{id}/commands` (by code) was not tested for this device.

### Feeder DPs

| DP | Code | Access | Description |
|---|---|---|---|
| 245 | `feed_publish` | rw | **Feed.** Value 1–99 portions |
| 246 | `feed_report` | ro | Portions served in the last feeding. `0` = failed; positive = portions |
| 243 | `manual_feed_report` | ro | Last manual feeding (portions) |
| 244 | `auto_feed_report` | ro | Last scheduled feeding (portions) |
| 236 | `history_data` | ro | History encoded in 4 bytes: high byte = error (1 no food, 2 low food, 3 clog); 2nd = type (2 Alexa, 1 manual, 0 automatic); 3rd = actual portions; last = report ID, increments on every report |
| 237 | `schedule` | rw | Schedules (string; format **not decoded** — see below) |
| 235 | `weight` | rw | Auto-mode portions; hundreds digit = enables remote control, tens/units = portions |
| 233 | `control` | rw | Generic "control"; running it returns history. Semantics unexplored |
| 234 | `realtime_data` | ro | Real-time state (errors, portions) |
| 232 | `food_weight` | ro | Weight per portion, scale 1 |
| 238 | `battery_status` | ro | `high` / `low` / `no` |
| 239 | `food_storage_status` | ro | `full` / `less` / `lack`; the timestamp can be years old, so treat it as possibly stale |
| 240 | `feed_block_status` | ro | Clogged. **Did not clear after a successful feeding** → likely a stale flag |
| 241 | `feed_stuck_status` | ro | Food stuck |
| 242 | `feed_voice_record` | rw | Feeder voice recording (0 normal, 1 record, 2 error) |

Camera DPs (101 `basic_indicator`, 104 `basic_osd`, 105 `basic_private`, 106 `motion_sensitivity`,
108 `basic_nightvision`, 134 `motion_switch`, 160 `basic_device_volume`, 162 `device_restart`, etc.)
follow the standard Tuya camera pattern.

### Camera

`POST /v1.0/devices/{id}/stream/actions/allocate` with `{"type": "RTSP"}` returns an `rtsps://` URL;
`ffmpeg -rtsp_transport tcp -i <url> -frames:v 1` captures a real frame within seconds. Notes:

- **HLS does not work here**: the URL is allocated and opens, but every frame is the loading spinner,
  even after 20s. Use RTSP.
- Privacy mode (DP 105 `basic_private`) was off and never the blocker.
- `snap.ts` uses RTSP and keeps the last frame of an 8s capture.
- The stream is H.264 Main 640x360 plus G.711 (pcm_mulaw) audio, so a relay can pass packets through
  without decoding or re-encoding.
- The URL grants access to the live feed and **expires within a minute or so** (a pull that worked
  failed with `wrong response on DESCRIBE` a minute later): treat it as a secret and allocate a new one
  per viewing session. Browsers cannot play `rtsps://`, so the backend has to relay it.

#### go2rtc experiment (v1.9.14)

go2rtc as a sidecar, with an `echo:` source (it runs a command without a shell and uses its stdout as
the URL, so every connection gets a fresh Tuya URL and no secret sits in the config):

- Plays in Chromium via **MSE** and **WebRTC**; the camera's on-screen clock matched the browser
  clock (~1s latency on MSE, under 1s on WebRTC).
- 3 simultaneous fMP4 viewers: ~1% of one core, ~32 MB RSS. With nobody watching: 0 CPU ticks, no
  consumers, no open connection to the camera.
- No transcoding involved, so no WebAssembly or server-side re-encode is needed.
- A second machine on the same network played the WebRTC stream with no ICE configuration. Not
  verified: hardware-decode confirmation, touch panel.
- Gotcha: `echo:` has no shell, so call the script's binary with absolute paths. Starting it through
  `pnpm`/`tsx` adds ~1-2s to each new session.

#### Camera relay in the repo

`compose.yaml` runs go2rtc (`alexxit/go2rtc:1.9.14`, `network_mode: host`, config mounted read-only
from `config/go2rtc.yaml`); start it with `docker compose -f services/tuya-feeder/compose.yaml up -d`.
`server/camera.ts` exposes `POST /api/services/tuya-feeder/camera/session`: it allocates a fresh Tuya RTSP URL and registers it in go2rtc as
stream `feeder`. Requires `TUYA_FEEDER_DEVICE_ID` in `.env`.

- Register with `PATCH /api/streams`, **not `PUT`**: PUT persists the stream (and the secret URL) into
  go2rtc's config file. The read-only mount is a second guard.
- Verified: two consecutive sessions replace the URL, the stream plays (H.264 640x360), and a viewer
  kept connected for 77s kept receiving data past the URL's ~1 minute lifetime.
- `POST /api/services/tuya-feeder/camera/webrtc` proxies the SDP offer/answer to go2rtc, so only go2rtc's WebRTC media
  port (8555) needs to be reachable by clients. The UI side is `web/`: `feeder-camera-tile.svelte` is the
  camera tile of the Cameras window, and it opens the connection on mount and closes it on unmount
  (verified: closing the window drops go2rtc to 0 consumers). The video starts muted because browsers
  only autoplay muted video; audio (G.711) arrives but the new design has no sound control yet.
- Gotcha: Fastify rejects a request that has `Content-Type: application/json` with an empty body, so the
  client only sets the header when it sends a body.

#### Feeder control in the repo

`server/feeder.ts` exposes `GET /api/services/tuya-feeder/status` and `POST /api/services/tuya-feeder/feed`
(`{ "portions": 1..99 }`, rejected with 400 otherwise, 429 within 10s of the previous feeding); both are also
service actions (`feeder-status`, `feed`), which is what NOX calls. The automation card in the Cameras window
(and the `feeder` dock widget) shows the hopper level and the last feeding, with a two-step
**DISPENSE NOW → CONFIRM** button that cancels itself after 5s and dispenses 1 portion. After a feeding it
polls until `feed_report`'s timestamp changes and shows `SERVED n` or `FEEDING FAILED`.

- Status is derived from the shadow: last feeding from `feed_report` (source = whichever of the manual/auto
  reports is closest in time), battery, food storage, and `blocked`. **`blocked` is only true when the
  clog flag is newer than the last feeding**, since the flag never cleared after successful feedings.
- Readings older than 7 days are marked STALE in the UI (`food_storage_status` can be years old). Food
  storage is an enum (`full` / `less` / `lack`), not a percentage, so the hopper shows FULL / LOW / EMPTY
  with a level bar rather than a number.
- Scheduled feedings do run on their own and are reported through `auto_feed_report`.
- The Tuya token is cached in `tuya-client.ts` until shortly before it expires.
- A real feeding triggered from the UI works end to end.

### Open questions

- **`schedule` format** (the design's NEXT FEEDING and day schedule need it; until it is decoded the
  automation card leaves them out rather than invent them): Tuya's docs say "1–7 bytes of weekdays, then 3-byte rules (portions + minutes
  since 0h), binary + base64". The value observed on the test unit is a ~15-character repeating string
  starting with `7f` — it **does not match the documented format**, so decoding it requires comparing
  against changes made in the SmartLife app. *Hypothesis, not verified*: the value is a hex string made of
  15-character records, `7f` + hour (2 hex digits) + minute (2) + portions (2) + `1` + `000000`, where `7f`
  would be the weekday mask (all seven days). That reads as one record per slot with the hour in the second
  byte, but the number of slots it yields (11 on the test unit) does not look like a schedule anyone set,
  so it has to be checked against what the SmartLife app shows before the card relies on it.
- Confirm whether `feed_block_status` really is a stale flag.
- **Local** control via `tinytuya` (LAN, no cloud): the feeder is Wi-Fi, so it is viable. Needs the
  device `local_key` (field of `/v1.0/devices/{id}`). Would give raw DP access and lower latency, and
  keep working without internet.
- `history_data` decoding is not implemented yet (uses the 4-byte rule above; mind the DP's `scale: 1`).

## API pitfalls

- Device listing uses `GET /v1.0/iot-01/associated-users/devices` (returns 0 until the app account is
  linked to the project).
- Error responses come with `success: false`, `code`, `msg` — always check `success`, the HTTP status is 200.
- A project token (`grant_type=1`) lasts under 2h; `tuya-client.ts` caches it and renews it shortly
  before it expires.

## Planned next steps

1. Decode `schedule` and `history_data` to show schedules and history.
2. MCP tool to trigger the feeder from inside Claude Code.
3. Support more Tuya device types beyond the feeder.
