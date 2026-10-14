#!/usr/bin/env bash
# shim: exec-wrapper
# Compatibility entrypoint for `mise run tools:audit`; the tool-tiers package owns the lookup.
exec bun "$(dirname "${BASH_SOURCE[0]}")/../tools/tool-tiers/src/tool.ts" audit "$@"
