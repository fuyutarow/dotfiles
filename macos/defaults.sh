#!/usr/bin/env bash
# macOS system defaults — declarative, idempotent (single source of truth).
# Run via `mise run macos:defaults` (wired into `mise run mac:init`).
# macOS-only topic dir (like karabiner/); do not source this on WSL.
set -euo pipefail

# --- Trackpad: tracking speed ("Point & Click" > "Tracking speed" slider) ---
# Range is 0 (slowest) .. 3 (fastest). Apple ships this UNSET, which resolves to 0.6875
# (slider notch 3/8) — that felt too slow, so this pins 2x the shipped baseline.
defaults write -g com.apple.trackpad.scaling -float 1.375

echo "✅ macOS defaults applied."
echo "   Some settings (trackpad scaling included) only take effect after logout/login,"
echo "   or after quitting and relaunching apps that already read the old value."
