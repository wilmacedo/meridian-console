#!/usr/bin/env bash
# Starts a local HTTPS test site and a headless Chrome with a debug port, runs the gateway against them and cleans up.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py="$here/../../.venv/bin/python"
tmp="$(mktemp -d)"
site_port=18443
cdp_port=19333
cleanup() { kill "${site_pid:-}" "${chrome_pid:-}" 2>/dev/null || true; daemon_pid="$(cat "$tmp/state/harness/runtime/"*.pid 2>/dev/null | head -1 || true)"; [ -n "$daemon_pid" ] && kill "$daemon_pid" 2>/dev/null || true; "$py" -c "
import os; os.environ['BH_HOME']='$tmp/state/harness'; os.environ['BU_NAME']='meridian'
from browser_harness.admin import stop_remote_daemon" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tmp/k.pem" -out "$tmp/c.pem" -days 1 -subj /CN=localhost >/dev/null 2>&1
"$py" "$here/site.py" $site_port "$tmp/c.pem" "$tmp/k.pem" & site_pid=$!
google-chrome --headless=new --no-sandbox --ignore-certificate-errors --no-first-run --user-data-dir="$tmp/chrome" --remote-debugging-port=$cdp_port about:blank >/dev/null 2>&1 & chrome_pid=$!
for _ in $(seq 40); do curl -s "http://127.0.0.1:$cdp_port/json/version" >/dev/null && break; sleep 0.25; done
export E2E_PORT=$site_port MERIDIAN_BROWSER_CDP_URL="http://127.0.0.1:$cdp_port" MERIDIAN_BROWSER_STATE_DIR="$tmp/state" MERIDIAN_BROWSER_ALLOWED_DOMAINS=localhost
"$py" "$here/run_e2e.py"

# The server's half needs a Node that runs .ts directly (22.6+; the repo uses 24).
node_bin="$(command -v node)"
if [ "$("$node_bin" -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then node_bin="$(ls -d "$HOME"/.nvm/versions/node/v2[2-9]*/bin/node 2>/dev/null | tail -1 || true)"; fi
if [ -n "$node_bin" ]; then "$node_bin" --experimental-strip-types --no-warnings "$here/run_ts.mts"; else echo "skipped the TypeScript half: no Node 22+ found"; fi
