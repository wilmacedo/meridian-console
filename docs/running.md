# Running Meridian permanently

In development the frontend runs on Vite (`pnpm dev:web`) and the backend with `pnpm dev:server`. To keep
Meridian running as a service, the Fastify server serves the **built** frontend itself, on the same port as
the API, so there is one process, one origin and one `tailscale serve`.

## Run it once by hand

```sh
pnpm start        # builds apps/web, then starts the server on :4000 (PORT overrides it)
```

Open `http://localhost:4000` on this machine. The server listens on 127.0.0.1 only (NOX has a shell here and Meridian has no login), so other devices come in through `tailscale serve` (below). If there is no build the server says so in its log and only the API is served;
`MERIDIAN_WEB_DIST` points it at a build somewhere else. The page is always revalidated and the hashed
assets are cached for good, so a new build shows up on the next load.

## Keep it running (systemd, as your user)

The unit is `deploy/meridian-console.service`. It starts the server through a shell that loads nvm,
because Node 24 comes from there, and restarts it if it crashes. Install it once:

```sh
pnpm build                                              # the unit serves what was last built
mkdir -p ~/.config/systemd/user
cp deploy/meridian-console.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now meridian-console
sudo loginctl enable-linger $USER                       # start at boot, without anyone logged in
```

`WorkingDirectory` in the unit is `%h/jarvis` (the repository in your home directory); edit the copy if the
checkout is elsewhere. The server reads `.env` from the repository root, like `pnpm start` does.

- Logs: `journalctl --user -u meridian-console -f`
- Status: `systemctl --user status meridian-console`
- After pulling changes: `pnpm build && systemctl --user restart meridian-console`. The server has no
  watch mode, so it must be restarted for backend changes; a frontend-only change needs just the build.

The Vite dev server and this service both want port 4000 for the API, so stop one before starting the
other.

## HTTPS for the microphone

Point `tailscale serve` at the server instead of Vite (see [`https.md`](https.md)):

```sh
tailscale serve --bg --https=443 http://127.0.0.1:4000
```
