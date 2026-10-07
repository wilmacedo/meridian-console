# Custom domain for Meridian (meridian.wilmacedo.com)

Goal: open Meridian at `https://meridian.wilmacedo.com` (no port), only reachable inside the Tailnet,
with a valid HTTPS certificate. The old address `https://debian-desktop.tailbf060.ts.net` must keep working.

## Already done

- Domain `wilmacedo.com` (one L) is on Cloudflare. Not `willmacedo.com`.
- DNS record created: `meridian.wilmacedo.com` A -> `100.99.146.5` (the Tailnet IP of debian-desktop),
  TTL 300, DNS only (proxy off, must stay off: Cloudflare cannot reach a Tailnet IP).
- A Cloudflare API token with DNS access to that zone is in `/home/wil/guarden/.env` (`CLOUDFLARE_API_TOKEN`).
  The same token also appears in `personal/aqw-toolkit/aqw-helper-system/.env`. The tokens in `anywh/.env`
  only see `anywh.sh`. Never print the token.
- Caddy v2.11.4 at `/home/wil/.local/bin/caddy` already has the `dns.providers.cloudflare` module.
- Caddy setup in `/home/wil/.meridian/caddy/`:
  - `Caddyfile`: site `meridian.wilmacedo.com:8443`, `bind 100.99.146.5`, `tls { dns cloudflare {env.CF_API_TOKEN} }`,
    `reverse_proxy 127.0.0.1:5173` with `header_up Host 127.0.0.1:5173`
    (Vite only allows `.ts.net` hosts, so the Host header is rewritten instead of editing vite.config.ts).
    Global options: `admin off` and `auto_https disable_redirects` (port 80 on the Tailnet IP is not bindable).
  - `env`: `CF_API_TOKEN=...` (chmod 600).
  - `start.sh`: loads `env` and runs Caddy. Started detached with `setsid nohup ./start.sh`.
- Verified: `https://meridian.wilmacedo.com:8443` answers 200 with a valid Let's Encrypt certificate.

## Why it is not on 443 yet

Port 443 on `100.99.146.5` is held by `tailscale serve` (`https://debian-desktop.tailbf060.ts.net` -> `127.0.0.1:5173`).
Caddy cannot share it. Changing `tailscale serve` needs root; `sudo` asks for a password and the user `wil`
is not the Tailscale operator. A first attempt at the swap failed with "serve config denied" and changed nothing.

## Next steps

1. Once, on the server: `sudo tailscale set --operator=$USER` (the owner runs it).
2. Move the old address off 443:
   `tailscale serve --https=443 off` then `tailscale serve --bg --https=8444 http://127.0.0.1:5173`
   (the old URL becomes `https://debian-desktop.tailbf060.ts.net:8444`; 8443 is used by Caddy for now).
   Do this only when the owner has no important session open: it drops the current Meridian connection.
3. In `Caddyfile`, change the site to `meridian.wilmacedo.com` (drop `:8443`), stop Caddy (`pkill -x caddy`;
   do not use `pkill -f`, it kills the calling shell), start `start.sh` again, and test
   `curl -s -o /dev/null -w '%{http_code}' https://meridian.wilmacedo.com/`.
4. Make Caddy survive reboots: a systemd user unit (`~/.config/systemd/user/meridian-caddy.service`,
   `ExecStart=/home/wil/.meridian/caddy/start.sh`, `Restart=on-failure`, `loginctl enable-linger wil` if needed).
5. Optional: if the Meridian server must also accept this host directly, add it to `allowedHosts` in
   `apps/web/vite.config.ts`, and check `docs/https.md`, which still describes only the `.ts.net` access.
6. Update `docs/https.md` with the final addresses.
