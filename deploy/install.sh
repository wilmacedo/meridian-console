#!/usr/bin/env bash
# One-time (and idempotent) setup of automatic deploys: the prod worktree, what git-ignored state it
# borrows from this checkout, the git hooks and the systemd unit. Does not start the unit: see docs/deploy.md.
set -euo pipefail

DEV="$(cd "$(dirname "$0")/.." && pwd)"
PROD="${MERIDIAN_PROD_DIR:-$HOME/meridian-prod}"

[ -d "$PROD" ] || git -C "$DEV" worktree add --detach "$PROD" main

# Git-ignored state that prod shares with this checkout.
ln -sfn "$DEV/.env" "$PROD/.env"
ln -sfn "$DEV/services/browser-harness/.venv" "$PROD/services/browser-harness/.venv"
(cd "$PROD" && pnpm install --frozen-lockfile && pnpm build)

hooks="$(git -C "$DEV" rev-parse --git-path hooks)"
for hook in post-commit post-merge; do ln -sfn "$DEV/deploy/hooks/deploy-on-main" "$DEV/$hooks/$hook"; done

mkdir -p ~/.config/systemd/user
cp "$DEV/deploy/meridian-console.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable meridian-console
