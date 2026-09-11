#!/usr/bin/env bash
# macOS system defaults — declarative, idempotent (single source of truth).
# Run via `mise run mac:defaults` (wired into `mise run mac:init`).
# macOS-only topic dir (like karabiner/); do not source this on WSL.
set -euo pipefail

# --- Trackpad: tracking speed ("Point & Click" > "Tracking speed" slider) ---
# Range is 0 (slowest) .. 3 (fastest). Apple ships this UNSET, which resolves to 0.6875
# (slider notch 3/8) — that felt too slow, so this pins 2x the shipped baseline.
defaults write -g com.apple.trackpad.scaling -float 1.375

# --- Maccy (clipboard history; installed by Brewfile cask "maccy") ---
# Popup on Cmd+B: carbonKeyCode 11 = B, carbonModifiers 256 = Cmd. pasteByDefault: selecting an
# entry pastes it instead of only copying. `defaults write` creates the domain if Maccy has never
# launched, so this is safe before first run; the relaunch is skipped when Maccy is not present.
defaults write org.p0deje.Maccy KeyboardShortcuts_popup -string '{"carbonKeyCode":11,"carbonModifiers":256}'
defaults write org.p0deje.Maccy pasteByDefault -bool true
if [ -d "/Applications/Maccy.app" ]; then
  killall Maccy 2> /dev/null || true
  open -a Maccy
fi

echo "✅ macOS defaults applied."
echo "   Some settings (trackpad scaling included) only take effect after logout/login,"
echo "   or after quitting and relaunching apps that already read the old value."
