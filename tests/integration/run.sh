#!/usr/bin/env bash
# Runs api/index.js against a fake Supabase (local HTTPS), fake Salla and fake Claude.
# No network, no secrets. Usage: bash tests/integration/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tmp/k.pem" -out "$tmp/c.pem" -days 1 -subj "/CN=localhost" 2>/dev/null
cp "$here/harness.js" "$tmp/"
cd "$tmp" && NODE_TLS_REJECT_UNAUTHORIZED=0 node harness.js "$here/../../api/index.js" 2>/dev/null | grep -E "PASS|FAIL"
! NODE_TLS_REJECT_UNAUTHORIZED=0 node harness.js "$here/../../api/index.js" 2>/dev/null | grep -q FAIL
