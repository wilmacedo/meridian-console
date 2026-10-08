#!/usr/bin/env bash
# Builds the WhatsApp bridge into the data directory, where the service looks for it. Needs Go and a C compiler
# (the SQLite driver is cgo). Run it again to update; the service picks the new binary up when it restarts.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
data="${MERIDIAN_DATA_DIR:-$HOME/.meridian}/whatsapp"
mkdir -p "$data/bin"
cd "$here/bridge"
CGO_ENABLED=1 go build -trimpath -o "$data/bin/bridge" .
echo "built $data/bin/bridge"
