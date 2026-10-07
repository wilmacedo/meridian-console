# HTTPS on the LAN

Browsers expose the microphone only in a **secure context**: `https://…`, or `http://localhost`. Voice
needs the mic, so a screen on another machine must reach Meridian over HTTPS. Meridian uses Tailscale for
that: it already is the network boundary (no auth, see `architecture.md`), and `tailscale serve` gives the
host a real certificate and a name like `https://<machine>.<tailnet>.ts.net`, with no certificate to
generate or install on any device.

## One-time setup

1. **Enable HTTPS for the tailnet.** In the admin console, DNS page
   (<https://login.tailscale.com/admin/dns>), keep MagicDNS on and press **Enable HTTPS…**. Machine names
   then show up in Certificate Transparency logs, which are public: the *name* of the host and tailnet
   becomes discoverable; traffic and the service stay private to the tailnet.
2. **Let your user manage `serve` without sudo** (once, on the host): `sudo tailscale set --operator=$USER`.
3. **Publish the app** on the host:

   ```sh
   tailscale serve --bg --https=443 http://127.0.0.1:5173   # development: the Vite dev server
   ```

   `tailscale serve status` shows the URL; `tailscale serve --https=443 off` removes it. This is `serve`,
   not `funnel`: it is reachable from your tailnet only, never from the public internet.

The Vite dev server proxies `/api` (including the WebSocket) to the Fastify server on port 4000, so one
HTTPS endpoint is enough. `apps/web/vite.config.ts` allows `*.ts.net` hosts; without that Vite answers
"Blocked request. This host is not allowed".

Once Meridian is built and served by the Fastify server itself (run-permanently work), point `serve` at
that port instead of 5173.

## Check

Open `https://<machine>.<tailnet>.ts.net` from another device on the tailnet. The padlock is valid, and
the microphone prompt appears when voice is on.

## Problems

- *No `Enable HTTPS` option or `tailscale serve` says HTTPS is not enabled*: step 1 was skipped; `tailscale
  status --json` lists `CertDomains` once it is on.
- *Certificate errors on the first request*: the certificate is issued on demand, so the very first
  request can take several seconds.
- *`access denied` from `tailscale serve`*: step 2.
