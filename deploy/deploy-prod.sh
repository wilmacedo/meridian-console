#!/usr/bin/env bash
# Brings the prod worktree to the tip of main: install, typecheck, build, restart, health check, and back
# to the previous commit if anything fails. Started by the git hooks (deploy/hooks); safe to run by hand.
set -Eeuo pipefail

DEV="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PROD="${MERIDIAN_PROD_DIR:-$HOME/meridian-prod}"
UNIT="${MERIDIAN_UNIT:-meridian-console}"
PORT="${MERIDIAN_PROD_PORT:-4000}"
LOG="${MERIDIAN_DATA_DIR:-$HOME/.meridian}/deploy.log"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

# One deploy at a time; a commit that lands meanwhile waits and then deploys what main is by then.
exec 9>"$PROD.lock"
flock -w 600 9

# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null

target="$(git -C "$DEV" rev-parse main)"
current="$(git -C "$PROD" rev-parse HEAD)"
[ "$target" != "$current" ] || exit 0

# Docs never reach the running app, so they move the worktree without a restart.
if ! git -C "$DEV" diff --name-only "$current" "$target" | grep -qvE '^docs/|\.md$'; then
  git -C "$PROD" checkout --detach --quiet "$target"
  log "docs only, moved to ${target:0:7} without a restart"
  exit 0
fi

build() {
  git -C "$PROD" checkout --detach --quiet "$1"
  (cd "$PROD" && pnpm install --frozen-lockfile --silent && pnpm typecheck && pnpm build)
}

healthy() {
  for _ in $(seq 40); do
    curl -fs "http://127.0.0.1:$PORT/health" >/dev/null && return 0
    sleep 0.5
  done
  return 1
}

rollback() {
  trap - ERR
  log "failed, rolling back to ${current:0:7}"
  git -C "$PROD" checkout --detach --quiet "$current"
  (cd "$PROD" && pnpm install --frozen-lockfile --silent && pnpm build) || true
  systemctl --user restart "$UNIT" || true
  healthy && log "rolled back" || log "rollback is not healthy either, check: journalctl --user -u $UNIT"
  exit 1
}
trap rollback ERR

log "deploying ${current:0:7} -> ${target:0:7}"
build "$target"
systemctl --user restart "$UNIT"
healthy
log "deployed ${target:0:7}"
