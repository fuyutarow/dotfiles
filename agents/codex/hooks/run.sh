#!/bin/sh
# shim: hook-entry
set -eu
command -v bun >/dev/null 2>&1 || { echo "dispatch-contract: bun is required" >&2; exit 2; }
exec bun "$(dirname "$0")/enforce-terra-dispatch.ts"
