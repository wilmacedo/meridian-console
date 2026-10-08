# Automatic deploy

A commit on `main` in the development checkout (`~/jarvis`) updates the instance that runs 24/7. Prod
never runs from the development checkout: it runs from a git worktree, `~/meridian-prod`, that only ever
holds committed code.

```
git commit on main
  -> .git/hooks/post-commit (deploy/hooks/deploy-on-main)      post-merge does the same
  -> systemd-run --user deploy/deploy-prod.sh                  detached: git returns at once
       1. skip if prod already has main; docs-only changes just move the worktree
       2. checkout main in ~/meridian-prod, pnpm install, typecheck, build
       3. systemctl --user restart meridian-console
       4. wait for http://127.0.0.1:4000/health; if any step fails, go back to the previous commit
```

The log is `~/.meridian/deploy.log`. The gate is `typecheck` only: the server and calendar test suites
already fail on `main`. Deploys are serialised with a lock, so a commit that lands during one waits.

A restart interrupts a NOX turn in flight; NOX resumes its session afterwards.

## Running things

- **Prod**: unit `meridian-console` (`deploy/meridian-console.service`), Fastify on `127.0.0.1:4000`
  serving the built frontend. Caddy proxies to it, and blocks `/mcp*` (NOX's tools and the approval gate
  are for local processes only). `journalctl --user -u meridian-console -f`.
- **Development**: prod owns port 4000, so a dev or test server uses its own ports:

  ```sh
  PORT=4100 pnpm dev:server
  MERIDIAN_API_PORT=4100 pnpm dev:web      # Vite on 5173 proxying /api to 4100
  ```

  Use a separate `MERIDIAN_DATA_DIR` too if the test must not touch prod's databases.
- **NOX** reads and edits `~/jarvis` (`MERIDIAN_REPO_ROOT` in the unit), not the worktree. Its edits to
  `services/<id>` go live with the next commit on `main`.

## Setup

`deploy/install.sh` is idempotent: it creates the worktree, links `.env` and the browser-harness
`.venv` from the development checkout (both git-ignored), builds once, links the git hooks and installs
the unit. It does not start the unit. The first switch from a hand-started server:

1. `deploy/install.sh`
2. stop the old server, `systemctl --user start meridian-console`
3. in `~/.meridian/caddy/Caddyfile`, in both sites, replace the `reverse_proxy 127.0.0.1:5173 { ... }`
   block with the one below (the Host rewrite was only for Vite), then
   `systemctl --user restart meridian-caddy`

   ```
   handle /mcp* {
   	respond 404
   }
   handle {
   	reverse_proxy 127.0.0.1:4000
   }
   ```

## By hand

`deploy/deploy-prod.sh` deploys whatever `main` is now. Rolling back to an older commit: check it out in
`~/meridian-prod`, build and restart; the next commit on `main` deploys normally again.
