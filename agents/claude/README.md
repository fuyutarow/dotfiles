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
| `statusline-command.sh` | `~/.claude/statusline-command.sh` | two-line statusline (stays POSIX sh: degrades gracefully without jq/bun; cosmetic-only failure mode) |
| `hooks/` | `~/.claude/hooks/` (whole dir) | all hooks — TypeScript on bun (see below) |

`~/.claude/settings.local.json` (machine-specific permissions) stays **local**,
not shared.

## Hooks (`hooks/` — TypeScript on bun)

Hook logic is TypeScript run by **bun** (in `Brewfile`, both OSes); the only shell left
is `hooks/run.sh`, a ~30-line runner that locates bun (hooks can run with a narrow PATH)
and execs the named `.ts` with stdin passed through. Heavy detection lives in the
**correo** Rust binary; the `.ts` wrappers own hook-protocol plumbing + block policy.

| hook (event) | job | fail direction |
|---|---|---|
| `enforce-sonnet-agents.ts` (PreToolUse `Agent\|Task\|Workflow`) | pin every spawned agent to Sonnet: inject `model:'sonnet'` when omitted, deny non-sonnet, ask on unverifiable (named workflow / child `workflow()`) | **CLOSED** — any error ⇒ deny; `run.sh --fail-closed` denies even when bun is missing |
| `detect-leaked-toolcall.ts` (Stop) | alert (never block) on a tool call emitted as plain text; log + bell + desktop notify | OPEN |
| `detect-audit-theater.ts` (Stop) | exit 2 when a prose-audit turn uses self-justifying / unbounded gate language | OPEN |
| `detect-prose-correo.ts` (Stop) | exit 2 on correo findings — calque / codemix density / coinage | OPEN (no correo ⇒ silent skip) |

`lib.ts` holds the shared plumbing (stdin JSON, turn-scoped transcript slicing,
code/quote stripping, PreToolUse decision JSON, `findExe`). Rules: **zero npm deps**
(never trigger bun auto-install at hook time; `node:` built-ins only) and **fail
direction is explicit** in each hook's top-level try/catch — a TS exception exits 1,
which Claude Code treats as non-blocking, i.e. silent fail-open unless caught.

Tests spawn each hook end-to-end with synthetic payloads (fake `correo` included):

```sh
mise run test:hooks     # = bun test agents/claude/hooks
```

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
