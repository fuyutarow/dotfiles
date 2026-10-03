#!/usr/bin/env bash
# iTerm2 preferences sync — points iTerm2 at this dotfiles folder as its preferences
# store (macOS's own "load preferences from a custom folder" feature), so profile/keys/
# theme edits made in the iTerm2 GUI land as a diffable plist in this repo instead of
# being trapped in ~/Library/Preferences/com.googlecode.iterm2.plist, which cfprefsd
# caches and rewrites in ways a plain `link-dots.sh` symlink cannot survive.
# Run via `mise run mac:iterm2` (wired into `mise run mac:init`). macOS-only topic dir
# (like karabiner/); do not source this on WSL.
set -euo pipefail

defaults write com.googlecode.iterm2 PrefsCustomFolder -string "$HOME/dotfiles/iterm2"
defaults write com.googlecode.iterm2 LoadPrefsFromCustomFolder -bool true

echo "✅ iTerm2 pointed at $HOME/dotfiles/iterm2 for preferences."
echo "   Quit and relaunch iTerm2 for this to take effect (tmux sessions survive — just detach)."
echo "   On first relaunch, iTerm2 asks whether to write its current settings into that folder;"
echo "   say yes so iterm2/com.googlecode.iterm2.plist appears and can be committed."
echo "   Settings > General > Preferences > 'Save changes to folder when iTerm2 quits' has no"
echo "   known defaults(1) key (undocumented) — check it once in the GUI if you want every GUI"
echo "   change auto-persisted; otherwise iTerm2 just prompts to save on quit, which is fine too."
