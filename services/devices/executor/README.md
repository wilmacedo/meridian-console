# meridian-executor

The thin process that runs on the owner's machines so NOX can act on them. It decides nothing: it dials the
server, proves who it is, announces what it can do, and does what it is told. What NOX may do, and when the owner is
asked, is decided on the server (`services/devices`).

```
crates/core          protocol, mutual Ed25519 challenge, capability registry, reconnecting connection
crates/capabilities  what a device can do: one module per capability, per-OS code behind cfg(windows)
crates/executor      the binary: config, key store (DPAPI on Windows), log
scripts/             the logon task: install-task.ps1, start.ps1, stop.ps1, uninstall-task.ps1
```

## Capabilities (Windows)

Each returns one short text that says what happened, so no picture is needed to know it worked.

| Capability | Tier | What it does |
|---|---|---|
| `device_info` | observe | Host name, OS, executor version |
| `window_list` | observe | Open windows: id, program, title, state, monitor (`contains` narrows it) |
| `monitor_list` | observe | Monitors numbered from 1, primary first, in pixels |
| `process_list` | observe | Programs by name and pid (a count without `name`) |
| `clipboard_read` | observe | The text on the clipboard, first 2000 characters |
| `screenshot` | observe | One monitor as a PNG, at most 1600 px wide. The expensive last resort |
| `window_focus`, `_maximize`, `_minimize`, `_restore`, `_close`, `window_move` | act | Verified afterwards: the answer says whether it really happened |
| `process_start` | act | An installed program by its plain name, no path, no arguments. Shells and interpreters are refused |
| `clipboard_write` | act | Replaces the clipboard text |
| `open` | act | An http(s) link, or a document or folder by full path. Programs and scripts are refused |
| `notify` | act | A toast notification |
| `process_kill` | irreversible | Ends a pid at once. The server always asks the owner first |

A new capability is one file implementing `Capability` (name, tier, description, input schema, `run`) and one line in
`register`. The server learns it from the announcement; nothing there names it.

## Trust

- **The device key.** An Ed25519 key pair made on first run. The private key never leaves the machine: on Windows it
  is stored under DPAPI (`%APPDATA%\meridian-executor\device.key`, decryptable only by this Windows user); the server
  only ever sees the public key.
- **Every connection** starts with a fresh challenge in both directions (the exact bytes are in `core/src/auth.rs`
  and `server/executor/handshake.ts`, and both test against one shared vector). The executor checks the server is
  the one whose public key is pinned in its config **before it sends any proof**, so a fake server on the network
  learns nothing and cannot give orders.
- **A new device waits.** An unknown key is held with no power until the owner approves it (`device_approve`, which
  asks on screen). The executor says "waiting for the owner" in its log.
- **Revoking** a device (`device_revoke`) closes its connection and the executor stops for good (exit code 3): the
  server remembers the key and refuses it, it is not enrolled again. The kill switch cuts every executor at once and
  they reconnect when it is turned off.
- **What is not defended against:** malware already running as you on this PC could use the executor or read its
  key through DPAPI. That is why tiers, confirmations and the audit log live on the server.

## Build

Third-party crates are pinned by `Cargo.lock` (committed); always build with `--locked`. The owner builds the binary;
there is no installer, no service and no auto-update. Building on the Windows PC avoids cross-compiling:

```powershell
cd services\devices\executor
cargo build --release --locked      # target\release\meridian-executor.exe, about 1.4 MB
cargo test --locked                 # also exercises DPAPI, processes and the Win32 helpers
```

`cargo test` also runs on Linux (the core and the cross-platform capability); the Windows capabilities compile only
there.

## Install

1. Build, and copy `meridian-executor.exe` and `scripts\*.ps1` to a folder of your own, for example
   `C:\Users\<you>\meridian-executor`.
2. Ask NOX for `device_enroll` (or call it): it gives the server address and the server's public key.
3. Write `%APPDATA%\meridian-executor\config.json`. Use a tool that writes plain UTF-8 **without a BOM**:

   ```json
   { "url": "wss://<host>/api/services/devices/executor", "server_public_key": "<the key from device_enroll>", "name": "win-lan" }
   ```

   `name` is what NOX calls the device; it defaults to the host name.
4. Register the logon task, then start it:

   ```powershell
   powershell -ExecutionPolicy Bypass -File install-task.ps1 -Exe C:\Users\<you>\meridian-executor\meridian-executor.exe
   powershell -ExecutionPolicy Bypass -File start.ps1
   ```

   The task runs in your own interactive session with limited rights (an ssh session is not the desktop, so it could
   not see or move a window). `meridian-executor show-key` prints this device's public key.
5. Approve it: `device_list` shows "waiting for approval", `device_approve` with its id asks you on screen.

`stop.ps1` stops it; `uninstall-task.ps1` removes the task (the binary, the config and the key stay: delete
`%APPDATA%\meridian-executor` to forget the device, and revoke it on the server). The log is
`%APPDATA%\meridian-executor\executor.log`.

## Not covered yet

- macOS: the same capability names behind another `cfg` module (Accessibility and Screen Recording permissions are
  granted by hand once). Phase 5.
- A Windows executor running while the screen is locked cannot focus or capture windows; the answer says when it
  could not.
