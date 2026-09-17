#!/usr/bin/env bash
# macOS system defaults — declarative, idempotent (single source of truth).
# Run via `mise run mac:defaults` (wired into `mise run mac:init`).
# macOS-only topic dir (like karabiner/); do not source this on WSL.
set -euo pipefail

# --- Trackpad: tracking speed ("Point & Click" > "Tracking speed" slider) ---
# Range is 0 (slowest) .. 3 (fastest). Apple ships this UNSET, which resolves to 0.6875
# (slider notch 3/8) — that felt too slow, so this pins 2x the shipped baseline.
defaults write -g com.apple.trackpad.scaling -float 1.375

# --- Finder: show hidden (dotfile) files ---
defaults write com.apple.finder AppleShowAllFiles -bool true

# --- Dock: show only apps that are actually running (no persistent icons) ---
defaults write com.apple.dock static-only -bool true

# --- Keyboard: repeat speed ("Keyboard" > "Key repeat rate" / "Delay until repeat") ---
# Lower is faster; both need a logout/login to take effect (defaults(1) can't force that).
defaults write -g KeyRepeat -int 3
defaults write -g InitialKeyRepeat -int 20

# --- Menu bar: show battery percentage ---
# Control Center's own domain since Ventura moved menu-bar items out of com.apple.menuextra.*.
defaults write com.apple.controlcenter BatteryShowPercentage -bool true

# --- Screenshots: save location (default is Desktop, which gets noisy fast) ---
mkdir -p "$HOME/Pictures/Screenshots"
defaults write com.apple.screencapture location -string "$HOME/Pictures/Screenshots"

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

# --- Restart the apps that cache these settings at launch ---
killall Finder 2> /dev/null || true
killall Dock 2> /dev/null || true
killall ControlCenter 2> /dev/null || true

echo "✅ macOS defaults applied."
echo "   Key repeat speed (trackpad scaling included) only takes effect after logout/login."
