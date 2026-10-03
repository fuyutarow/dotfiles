
## Require
- macOS
- [iTerm2](https://iterm2.com/)

## How this works

iTerm2's plist can't be symlinked the way other dotfiles are (`scripts/link-dots.sh`):
`~/Library/Preferences/com.googlecode.iterm2.plist` is owned and cached by `cfprefsd`, which
rewrites the file underneath a symlink in ways that lose the link. Instead this topic dir uses
iTerm2's own **"load preferences from a custom folder"** feature — iTerm2 reads and writes
`com.googlecode.iterm2.plist` directly inside this directory, so profile/keybinding/theme edits
made in the GUI show up as an ordinary `git diff` here.

## Setup
```sh
mise run mac:iterm2   # bash iterm2/setup.sh — points iTerm2 at this folder
```
Then quit and relaunch iTerm2. On first relaunch it asks whether to write its current settings
into this folder — say yes. After that, `iterm2/com.googlecode.iterm2.plist` exists and is
tracked like any other dotfile.

Optional: `Settings (⌘,) → General → Preferences → "Save changes to folder when iTerm2 quits"`
auto-persists every GUI change on quit. There's no known `defaults(1)` key for that specific
checkbox, so it's the one manual step `setup.sh` can't do for you — without it, iTerm2 just
prompts to save on quit instead, which still works.
