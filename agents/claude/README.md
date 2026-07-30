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
| `statusline-command.ts` | `~/.claude/statusline-command.ts` | two-line statusline, run via bun (`settings.json` → `statusLine.command`) |
| `hooks/` | `~/.claude/hooks/` (whole dir) | all hooks — TypeScript on bun (see below), plus `herdr-agent-state.sh` |
| `hooks/repo-search.ts` | `~/.claude/hooks/repo-search.ts` (whole-dir link) and `~/.local/bin/repo-search` | declared query-shape router: ccc / rg / Serena; hook-colocated path is the guaranteed entrypoint |

`~/.claude/settings.local.json` (machine-specific permissions) stays **local**,
not shared.

### `hooks/herdr-agent-state.sh` — vendor-managed, not ours

Written by `herdr integration install claude` (it lands **inside this repo**, because
`~/.claude/hooks` is a symlink to `agents/claude/hooks/`). On `SessionStart` it reports Claude's
`session_id` + `transcript_path` to the herdr server over its unix socket
(`pane.report_agent_session`), which is what lets herdr show per-pane agent state and resume
agents on server restore. It no-ops unless `HERDR_ENV`/`HERDR_SOCKET_PATH`/`HERDR_PANE_ID` are set,
so it is inert outside herdr.

**Re-running the installer rewrites the script AND re-injects an absolute
`/home/<user>/...` path into `settings.json`.** That path breaks the other machine (this file is
shared macOS↔WSL). After any `herdr integration install claude`, re-normalize the SessionStart
hook to the house form: `sh ~/.claude/hooks/herdr-agent-state.sh session`.

## Hooks (`hooks/` — TypeScript on bun)

Hook logic is TypeScript run by **bun** (in `Brewfile`, both OSes); the only shell left
is `hooks/run.sh`, a ~30-line runner that locates bun (hooks can run with a narrow PATH)
and execs the named `.ts` with stdin passed through. Heavy detection lives in the
**correo** Rust binary; the `.ts` wrappers own hook-protocol plumbing + block policy.

| hook (event) | job | fail direction |
|---|---|---|
| `enforce-dispatch-contract.ts` (PreToolUse `Agent\|Task\|Workflow`) | what a dispatch must declare, on two axes. **Bearer**: inject `model:'sonnet'` when omitted, deny non-sonnet, allow `fable` only with a declared `ESCALATION(fable)`, ask on unverifiable (named workflow / child `workflow()`). **Effort**: deny a Workflow `agent()` carrying a literal `effort:'low'` unless the same call span declares `LOW-EFFORT(<stage>): <reason>` | **CLOSED** — any error ⇒ deny; `run.sh --fail-closed` denies even when bun is missing |
| `enforce-search-route.ts` (PreToolUse `Grep\|Bash`) | in an operational ccc project, deny raw Grep/rg/grep/find/fd/tree, direct ccc search/grep, and obvious inline-runtime search reimplementations; require a declared route through the colocated router | **CLOSED** — any hook error, missing bun, or missing colocated router ⇒ deny; ccc absent/unregistered ⇒ silent allow |
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

`repo-search` is also tested end-to-end with fake `ccc` and `rg` executables. Its routes are:

```text
concept/battery -> ccc search    literal/exhaustive/files -> rg
structural      -> ccc grep      symbol                   -> Serena
```

The policy gate and `repo-search.ts` share the already-linked `~/.claude/hooks/` directory, so
enforcement cannot appear without its canonical entrypoint. `~/.local/bin/repo-search` is only a
convenience link. A missing canonical file is a hard configuration fault: stop and repair it,
never emulate the search with a general-purpose runtime. An exit-zero ccc call with no result
blocks is reported as `NO_MATCH`, not `PASS`.

## Deploy

Symlinks are declared in `scripts/link-dots.sh` (Claude Code section, force
`ln -sfn` — overwrites the default `settings.json` that Claude Code auto-creates).

```sh
mise run link:dots     # one-time per machine; creates/refreshes the symlinks
```

After that, `git pull` updates these repo files and the symlinks reflect the
changes automatically (no relink needed). Note: if Claude Code ever rewrites
`~/.claude/settings.json` as a real file (atomic save can replace a symlink),
re-run `mise run link:dots`.

## statusline requirements

`jq` and `git` on PATH. Fresh WSL/Linux:

```sh
sudo apt install -y jq git
```

Without `jq` the statusline degrades gracefully to line 1 only. The script is
POSIX/dash-safe and reads `user@host`, cwd, git branch and the model/context
from the JSON Claude Code pipes in, so the same file renders correctly on both
mac (`fuyu@SophiaWilson:…`) and WSL (`fuyu@R99:…`) with no per-machine edits.
