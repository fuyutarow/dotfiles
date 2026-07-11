# Claude Code — user-level config (deployed to `~/.claude/`)

Topic dir for **user-global** Claude Code config that is symlinked onto every
machine (mac & WSL). This is NOT the dotfiles repo's own project settings —
those live in `~/dotfiles/.claude/` and are read only while working *inside*
this repo. Keep the two separate.

## Files

| repo file | symlinked to | holds |
|---|---|---|
| `settings.json` | `~/.claude/settings.json` | statusLine, model, theme, flags, hooks |
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | user-global policy (sonnet-agent rule nudge) |
| `statusline-command.sh` | `~/.claude/statusline-command.sh` | two-line statusline |
| `enforce-sonnet-agents.sh` | `~/.claude/enforce-sonnet-agents.sh` | PreToolUse gate: every spawned agent (Agent/Task/Workflow `agent()`) is pinned to Sonnet — inject `model:'sonnet'` when omitted, deny non-sonnet, ask on unverifiable (named workflow / child `workflow()`) |
| `detect-*.sh` | `~/.claude/detect-*.sh` | Stop-hook prose/toolcall guards |

`~/.claude/settings.local.json` (machine-specific permissions) stays **local**,
not shared.

## Deploy

Symlinks are declared in `scripts/link-dots.sh` (Claude Code section, force
`ln -sfn` — overwrites the default `settings.json` that Claude Code auto-creates).

```sh
mise run link-dots     # one-time per machine; creates/refreshes the symlinks
```

After that, `git pull` updates these repo files and the symlinks reflect the
changes automatically (no relink needed). Note: if Claude Code ever rewrites
`~/.claude/settings.json` as a real file (atomic save can replace a symlink),
re-run `mise run link-dots`.

## statusline requirements

`jq` and `git` on PATH. Fresh WSL/Linux:

```sh
sudo apt install -y jq git
```

Without `jq` the statusline degrades gracefully to line 1 only. The script is
POSIX/dash-safe and reads `user@host`, cwd, git branch and the model/context
from the JSON Claude Code pipes in, so the same file renders correctly on both
mac (`fuyu@SophiaWilson:…`) and WSL (`fuyu@R99:…`) with no per-machine edits.
