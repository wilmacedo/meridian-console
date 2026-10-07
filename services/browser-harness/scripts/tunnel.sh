#!/usr/bin/env bash
# Forwards the debug port of Chrome on another machine to this one, over SSH. Leave it running.
# The remote end listens on loopback only, so the tunnel is the only way in.
set -euo pipefail
host="${MERIDIAN_BROWSER_SSH_HOST:?set MERIDIAN_BROWSER_SSH_HOST to the SSH host that runs Chrome}"
port="${MERIDIAN_BROWSER_PORT:-9222}"
exec ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L "127.0.0.1:${port}:127.0.0.1:${port}" "$host"
