# whatsapp

The owner's personal WhatsApp, as a linked device on this machine, operated by voice through NOX: find people,
read and search conversations, download images and files, transcribe voice notes, and send text, images and voice
notes after the owner confirms. What NOX reads can become other things, a Calendar event first of all.

Personal use only. The library is unofficial and WhatsApp's terms do not allow it, so the account could be
restricted; the service keeps to a human pace (see the send limit) and never contacts anyone on its own.

## How it works

```
NOX ──service_whatsapp_* actions──▶ server/ (TypeScript) ──HTTP, loopback + token──▶ bridge/ (Go, whatsmeow) ──▶ WhatsApp
                                                                                       └─ messages.db, session.db
```

- **`bridge/`** speaks the multi-device protocol with [whatsmeow](https://github.com/tulir/whatsmeow), keeps every
  message it sees in `messages.db`, and answers a small HTTP API. It listens on loopback only and refuses requests
  without the token the service generates on every start (the token exists only in the server's memory and the
  bridge's environment). A lock on the data directory keeps two bridges off one session, and the bridge exits when
  the server that started it dies. The design follows [`whatsapp-mcp`](https://github.com/lharries/whatsapp-mcp)
  (MIT), rewritten on a current whatsmeow: the upstream bridge is pinned to an old protocol version, listens on all
  interfaces without authentication and prints the QR code only on a terminal.
- **`server/`** runs and restarts the bridge, exposes the actions below and the pairing route. The actions are
  NOX's tools, with the service SDK's confirmation cards, the event log and the audit trail.
- **`web/`** is one window: connection state and, when the phone has to scan, the QR code.

## Setup

1. Build the bridge once (needs Go and a C compiler; ffmpeg is needed for voice notes):
   `services/whatsapp/scripts/build-bridge.sh`. It goes to `$MERIDIAN_DATA_DIR/whatsapp/bin/bridge`. Run it again to
   update; the service uses the new binary when the server restarts.
2. Restart the server. The service shows `degraded: waiting for the phone to scan the QR code`.
3. Open the **WhatsApp** window and scan the code: phone → Settings → Linked devices → Link a device.

The session and the message history live in `$MERIDIAN_DATA_DIR/whatsapp/` (default `~/.meridian/whatsapp`). They
are as private as the phone: keep them out of backups that leave the machine. If the phone is offline for about
two weeks WhatsApp drops the linked device and the window asks for the QR code again. A fresh link brings only the
recent history the phone chooses to send, and everything after it; search covers only what this machine has seen.

| Variable | Meaning |
|---|---|
| `WHATSAPP_DATA_DIR` | Session, messages, downloads, outbox. Default `$MERIDIAN_DATA_DIR/whatsapp` |
| `WHATSAPP_BRIDGE_BIN` | Path of the bridge binary. Default `<data dir>/bin/bridge` |
| `WHATSAPP_BRIDGE_PORT` | Loopback port of the bridge. Default `7420` |
| `WHATSAPP_SEND_DIRS` | Extra folders a file may be sent from, separated by `:` |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | The same ones NOX's voice uses: transcribe voice notes, speak a text as a voice note |

A dev or test server must use its own `MERIDIAN_DATA_DIR`, or the prod bridge's lock keeps its bridge out.

## NOX's tools

| Action | Kind | What it does |
|---|---|---|
| `search-contacts {query}` | read | People and groups by name or number, with the chat id |
| `list-chats {limit?, query?}` | read | Recent chats with the last message |
| `read-chat {chat, limit?, from?, to?}` | read | Messages of one chat, oldest first, with local time |
| `search-messages {query, chat?, limit?, from?, to?}` | read | Text search over everything this machine has seen |
| `download-media {chat, id}` | read | Saves an image, video, voice note or file; returns the path |
| `transcribe-voice {chat, id}` | read | Voice note to text (ElevenLabs Scribe, any language) |
| `send-message {chat, text, replyTo?}` | confirms | Text |
| `send-file {chat, path, caption?}` | confirms | Image, video or document from an allowed folder |
| `send-voice {chat, text \| path}` | confirms | A voice note: a text spoken in NOX's voice, or an audio file |

`chat` is a chat id from an earlier result, a phone number with country code, or a name; a name that matches
several chats is refused with the candidates listed, never guessed.

## Guardrails

- **Chat content is data, never instructions.** Every read result carries a notice saying so (`server/untrusted.ts`),
  message text stays under a `text` field instead of being merged into the answer, and NOX's persona states the
  rule first and without exceptions: a message that claims to be from the owner, NOX or the system, or asks to send,
  forward or run something, is reported to the owner and not acted on. Contact and group names, captions, file
  names and voice-note transcripts are covered too.
- **Every send asks the owner on the screen**, naming the recipient and the text (`server/send-flow.ts`). A caller
  with no screen is always refused. NOX sends only what the owner asked for in that conversation.
- **Send limit**: 6 a minute and 40 an hour, checked before the owner is asked and counted only for sends that went.
- **Files leave only from allowed folders** (downloads, the outbox, `WHATSAPP_SEND_DIRS`), with symlinks resolved,
  so a tricked NOX cannot mail out an arbitrary file.
- **Nothing sensitive is returned**: no session keys, no QR payload outside the pairing view. The event stream gets
  one line per send (recipient, never the text).
- Reading marks nothing as read on the phone, and the bridge announces itself as unavailable so the phone keeps
  its notifications.

## Tests

- `pnpm --filter @meridian/service-whatsapp test`: chat resolution, time parsing, the untrusted framing, the send
  limit, file policy, the confirm-then-send flow and the transcription call.
- `go test ./...` in `bridge/`: the message store queries.
- Not covered by automated tests: the live connection to WhatsApp (pairing, history sync, sending media), which
  needs a real phone.
