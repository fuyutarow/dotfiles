# Hooks — schema, events, matcher semantics & recipe book

> Deterministic lifecycle enforcement. Read after **SKILL.md §3** (essentials live there). A hook
> *guarantees* an action; CLAUDE.md only *asks*. Verified against `code.claude.com/docs/en/hooks`
> + `…/hooks-guide` (2026-06).

## Schema — the `hooks` object

`settings.json` `"hooks"` is keyed by **event name** → array of `{matcher, hooks:[…]}` groups. Each
inner hook is `{type:"command", command}` (or `prompt`/`agent`/`http`). **Add a new event as a
SIBLING key — never replace the whole object** (precedence merges across the 5 settings levels).

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command",
          "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh" } ] } ],
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [ { "type": "command", "command": "/abs/path/lint-check.sh" } ] } ]
  },
  "disableAllHooks": false
}
```

`type` values: `command` (shell, stdin = event JSON, 10-min timeout; `UserPromptSubmit`→30s),
`prompt` (single Haiku call, 30s), `agent` (subagent w/ tools, **experimental**, 60s default),
`http` (POST event JSON to `url`; status code alone cannot block — use response body). Override any
with `"timeout": <seconds>`.

## Events & matcher support

| Event | Matcher | Fires |
|---|---|---|
| `PreToolUse` | tool names | before a tool runs (can block) |
| `PostToolUse` | tool names | after a tool **succeeds** (cannot undo) |
| `PostToolUseFailure` | tool names | after a tool fails |
| `PostToolBatch` | **none** | after a parallel tool batch |
| `UserPromptSubmit` | **none** | before prompt processing |
| `Stop` | **none** | Claude finishes responding (not on interrupt) |
| `SubagentStop` | agent type | subagent finishes |
| `Notification` | notification type | Claude Code emits a notification |
| `SessionStart` | `startup`/`resume`/`clear`/`compact` | session begins/resumes |
| `SessionEnd` | `clear`/`resume`/`logout`/`prompt_input_exit`/`bypass_permissions_disabled`/`other` | session ends |
| `PreCompact` | `manual`/`auto` | before compaction (can block) |
| `CwdChanged` | **none** | directory changes (`cd`) |

Also available (less common): `Setup`, `PermissionRequest`, `PermissionDenied`, `StopFailure`,
`PostCompact`, `FileChanged`, `ConfigChange`, `SubagentStart`, `WorktreeCreate/Remove`,
`InstructionsLoaded`. **`UserPromptSubmit`, `Stop`, and `PostToolBatch` take NO matcher** — put the
group at the array top level with no `matcher` key.

### Matcher evaluation (case-sensitive)

| Pattern | Behavior |
|---|---|
| `""`, `"*"`, omitted | match **all** |
| `[a-zA-Z0-9_|]` only | exact string or pipe-list (`Bash`, `Edit|Write`) |
| anything else | **JavaScript regex** (`^Notebook`, `mcp__github__.*`) |

MCP tools are `mcp__<server>__<tool>`; match a whole server with the trailing `.*`
(`mcp__memory__.*`). Regex is case-sensitive by JS default.

## Exit-code contract (command hooks)

| Exit | Effect |
|---|---|
| `0` | allow. On `UserPromptSubmit`/`SessionStart` **stdout is ADDED to Claude's context**; on tool events stdout → debug log only |
| `2` | **BLOCK**, **stderr fed back to Claude** (`PreToolUse` blocks tool; `Stop`/`SubagentStop` keeps it working; `UserPromptSubmit` erases the prompt; `PostToolUse`/`Notification`/`SessionStart` etc. **cannot block** — stderr just shown) |
| other | non-blocking error: notice + first stderr line in transcript, full stderr in debug log, execution continues |

**Never mix exit 2 with JSON — JSON is ignored on exit 2.** Choose one channel: *exit 2 + stderr*
**or** *exit 0 + JSON*. For "add context but don't block," use exit 0 + `additionalContext` (NOT raw
stdout — that's plain reminder text on prompt events only).

## JSON output (exit 0)

Universal fields: `continue` (false = stop everything), `stopReason` (message when
`continue:false`), `suppressOutput` (hide stdout from transcript), `systemMessage` (warn the user).

**`PreToolUse` decisions live under `hookSpecificOutput.permissionDecision` — NOT a top-level
`decision`:**

```json
{ "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "…",
    "updatedInput": { "command": "rewritten cmd" },
    "additionalContext": "…" } }
```

`permissionDecision` ∈ `allow` | `deny` | `ask` | `defer`. **`Stop`/`SubagentStop`/`PostToolUse`/
`UserPromptSubmit`/`PreCompact`** use **top-level** `{"decision":"block","reason":"…"}` instead.

> **Hooks TIGHTEN, never LOOSEN.** A `deny` hook blocks **even under `bypassPermissions` /
> `--dangerously-skip-permissions`** (PreToolUse fires before the permission-mode check); an `allow`
> hook **never overrides a settings `deny`**. See `references/settings-permissions-mcp.md`.

## Recipe book

### Auto-format on edit (PostToolUse — runs AFTER the tool, formats post-hoc, **cannot block/undo**)

```json
{ "hooks": { "PostToolUse": [ {
  "matcher": "Edit|Write",
  "hooks": [ { "type": "command",
    "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" } ] } ] } }
```

### Protect files — PreToolUse exit-2 + a Stop backstop (Bash bypasses Edit/Write)

`.claude/hooks/protect-files.sh` (`chmod +x` it):

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
PROTECTED_PATTERNS=(".env" "package-lock.json" ".git/")
for pattern in "${PROTECTED_PATTERNS[@]}"; do
  [[ "$FILE_PATH" == *"$pattern"* ]] && { echo "Blocked: $FILE_PATH matches '$pattern'" >&2; exit 2; }
done
```

```json
{ "hooks": { "PreToolUse": [ {
  "matcher": "Edit|Write",
  "hooks": [ { "type": "command",
    "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh" } ] } ] } }
```

Bash (`>`, `sed -i`, `tee`) sidesteps Edit/Write, so **add a `Stop` hook** that scans
`git status --porcelain` for protected paths and exits 2 if any are dirty.

### Log every Bash command (PostToolUse — `tool_input.command` is the command that ran)

```json
{ "hooks": { "PostToolUse": [ {
  "matcher": "Bash",
  "hooks": [ { "type": "command",
    "command": "jq -r '.tool_input.command' >> ~/.claude/command-log.txt" } ] } ] } }
```

### Re-inject after compaction + persist env (SessionStart / CwdChanged)

`SessionStart` matcher `compact` echoes reminders to stdout (added to context post-compaction). To
keep env across Bash calls, append exports to `$CLAUDE_ENV_FILE` (exported on `SessionStart`,
`Setup`, `CwdChanged`, `FileChanged` only):

```json
{ "hooks": {
  "SessionStart": [ { "matcher": "compact",
    "hooks": [ { "type": "command",
      "command": "direnv export bash > \"$CLAUDE_ENV_FILE\"; echo 'Reminder: run npm test before commit'" } ] } ],
  "CwdChanged": [ {
    "hooks": [ { "type": "command", "command": "direnv export bash > \"$CLAUDE_ENV_FILE\"" } ] } ] } }
```

### Desktop notify (Notification event)

| OS | `command` |
|---|---|
| macOS | `osascript -e 'display notification "Claude needs input" with title "Claude Code"'` |
| Linux | `notify-send 'Claude Code' 'Claude needs input'` |
| Windows | `powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Claude needs input','Claude Code')"` |

macOS: run `osascript -e 'display notification "test"'` once in Terminal so Script Editor appears in
notification settings (else it fails silently).

### Stop-hook verification gate

`type:"prompt"` (Haiku judgment) or `type:"agent"` (runs the test suite) returning
`{"ok":false,"reason":…}` keeps Claude working; the `reason` becomes its next instruction:

```json
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "prompt",
    "prompt": "Check if all tasks are complete. If not, respond {\"ok\": false, \"reason\": \"what remains\"}." } ] } ] } }
```

For a **command** Stop gate, Claude force-stops after **8 consecutive blocks** — guard the cap by
exiting 0 when `stop_hook_active` is true:

```bash
[ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ] && exit 0
```

## The `if` field — best-effort tool+arg filter (v2.1.85+)

On `PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`PermissionRequest`/`PermissionDenied`, `if`
narrows a group by tool name **and** args using permission-rule syntax (`"Bash(git *)"`,
`"Edit(*.ts)"`). It inspects sub-commands and `$(…)`, and strips leading assignments. **It FAILS
OPEN** — if the Bash line can't be parsed the hook runs anyway, so it is a convenience filter, **not
a hard gate**. No `&&`/`||`/lists; one rule per `if`. For real enforcement use `settings.json`
permissions (`references/settings-permissions-mcp.md`).

## Input JSON & env vars

Common stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`. Tool events add
`tool_name`, `tool_input` (`.command` for Bash, `.file_path` for Edit/Write), `permission_mode`.
`SessionStart` adds `source`. `UserPromptSubmit` adds `prompt`. Stop adds `stop_hook_active`.
Env exported to every hook: **`CLAUDE_PROJECT_DIR`** (project root), `CLAUDE_PLUGIN_ROOT`,
`CLAUDE_EFFORT`, `CLAUDE_CODE_REMOTE`; **`CLAUDE_ENV_FILE`** (SessionStart/Setup/CwdChanged/
FileChanged only).

## Security

Hooks run **arbitrary shell with YOUR full permissions**. Therefore:

- Use **absolute or `${CLAUDE_PROJECT_DIR}`** paths; **quote all variables** (`"$FILE_PATH"`).
- Keep auto-`allow` matchers **narrow** — a broad `permissionDecision:"allow"` silently widens trust.
- Gate any `~/.zshrc`/`~/.bashrc` echoes behind `if [[ $- == *i* ]]` so shell-init output doesn't
  corrupt a shell-form hook's stdout/JSON.
- Kill everything with `"disableAllHooks": true` (does not disable managed-policy hooks).

## Debug

```bash
echo '{"tool_input":{"file_path":"x.ts"}}' | ./hook.sh   # exercise the script directly
claude --debug                                            # full hook stderr + resolution trace
chmod +x ./my-hook.sh                                     # if it "isn't running at all"
```

The **`/hooks` menu is READ-ONLY** (browse by event/matcher/source) — edit the settings JSON to
change anything.

## Sources

- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide)
