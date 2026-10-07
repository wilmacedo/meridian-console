#!/usr/bin/env bash
# Creates the service's own virtualenv with the pinned browser-harness. Safe to rerun.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install --quiet --requirement gateway/requirements.txt
.venv/bin/pip list 2>/dev/null | grep -i browser-harness
