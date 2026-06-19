# Output styles, statusline, headless mode & CI

> The non-interactive surface of Claude Code: changing the system prompt's tone, the local
> status bar, scripting `claude -p`, and wiring it into CI / GitHub. Parent: SKILL.md §0–§4.

---

## §1. Output styles — change role/tone/format, not knowledge

Output styles **modify the system prompt** (role, tone, output format). Read **once at session
start**; a change takes effect only after `/clear` or a new session. Use one when you keep
re-prompting for the same voice. For project conventions use CLAUDE.md instead (see
`references/memory.md`).

| Style | Behavior |
|---|---|
| **Default** | Stock software-engineering prompt |
| **Proactive** | Executes immediately, makes reasonable assumptions, prefers action over planning. *Stronger* autonomy guidance than `auto` mode — and it does **not** change permission mode, so prompts still appear |
| **Explanatory** | Adds educational "Insights" between tasks; longer output |
| **Learning** | Learn-by-doing; inserts `TODO(human)` markers for you to implement; longer output |

**Set it (do this, not the removed command):**

```json
// .claude/settings.local.json  (where /config writes it) — or any settings file
{ "outputStyle": "Explanatory" }
```

- Pick from a menu: `/config` → **Output style**. The standalone **`/output-style` command was
  deprecated in v2.1.73 and REMOVED in v2.1.91** — do not suggest it; use `/config` or the
  `outputStyle` setting.
- **Custom style = a Markdown file** in `~/.claude/output-styles` (user), `.claude/output-styles`
  (project), or the managed-settings dir. File name = style name unless `name:` is set. Frontmatter:

| Frontmatter | Purpose | Default |
|---|---|---|
| `name` | Style name if not the filename | filename |
| `description` | Shown in the `/config` picker | — |
| `keep-coding-instructions` | Keep the built-in SWE instructions (set `true` when still coding, just changing voice; omit for a writing/analyst assistant) | `false` |
| `force-for-plugin` | Plugin styles only: auto-apply when the plugin is enabled, overriding the user's `outputStyle` | `false` |

```markdown
---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---
When explaining code or data flow, start with a Mermaid diagram, then explain in prose.
```

- Custom styles **drop** the built-in SWE instructions (scoping, comments, verify) unless
  `keep-coding-instructions: true`. For a one-off addition without removing anything, prefer
  `--append-system-prompt` (see §3) — not a custom style.

---

## §2. statusLine — a local, zero-token status bar

`statusLine` runs a shell command, pipes **session JSON on stdin**, and renders stdout. It runs
**locally and consumes NO API tokens**.

**Easiest setup (do this first):** `/statusline show model + context % bar` — Claude generates a
script in `~/.claude/` and updates settings for you. Otherwise:

```json
{ "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "refreshInterval": 5
} }
```

- `type` is `"command"`; `command` is a script path or inline shell. `refreshInterval` (seconds,
  min `1`) re-runs on a timer **in addition to** event-driven updates (after each assistant
  message, after `/compact`, on permission-mode / vim-mode change; debounced 300 ms). Set it for
  time-based segments or when background subagents change git state while the main session is idle.
- Optional `padding` (extra horizontal chars, default `0`), `hideVimModeIndicator`.
- **Requires workspace trust** (same gate as hooks). `disableAllHooks: true` also disables it.
  Multi-line: each `echo` is a row. `COLUMNS`/`LINES` env vars give terminal size (v2.1.153+).

**Session JSON fields (use `jq -r '... // fallback'` — many are null early or absent):**

| Field | Meaning |
|---|---|
| `model.id`, `model.display_name` | Current model |
| `cwd`, `workspace.current_dir` | Working dir (`workspace.current_dir` preferred); `workspace.project_dir` = launch dir |
| `workspace.repo.{host,owner,name}` | From `origin` remote; absent outside a repo |
| `cost.total_cost_usd` | Client-side estimated session cost (USD) |
| `cost.total_duration_ms`, `cost.total_api_duration_ms` | Wall-clock / API-wait time |
| `cost.total_lines_added`, `cost.total_lines_removed` | Lines changed |
| `context_window.used_percentage` | **Pre-calculated** context % (input-only formula); use this, not manual math |
| `context_window.context_window_size` | `200000`, or `1000000` for extended-context models |
| `exceeds_200k_tokens` | Latest response total > 200k (fixed threshold, regardless of window size) |
| `effort.level` | `low`/`medium`/`high`/`xhigh`/`max`; reflects live `/effort`; ultracode reports as `xhigh`; absent if model lacks the param |
| `pr.number`, `pr.url`, `pr.review_state` | Open PR for the branch (`approved`/`pending`/`changes_requested`/`draft`); absent until found / after merge |
| `session_id` | Stable per session — use it (not `$$`/pid) as a cache-file key |

```bash
#!/bin/bash
input=$(cat)
MODEL=$(echo "$input" | jq -r '.model.display_name')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
echo "[$MODEL] ${PCT}% context"
```

- Test with mock input: `echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":25}}' | ./statusline.sh`.
- A `subagentStatusLine` setting (same `type`/`command` shape) overrides per-subagent rows; emit
  `{"id":"<task id>","content":"<row>"}` lines on stdout.
- **Footer link badges** (`footerLinksRegexes`) are a *separate* feature — clickable chips on
  regex match; they do not touch the statusLine script.

---

## §3. Headless mode — `claude -p`

`claude -p '<prompt>'` (alias `--print`) runs non-interactively; all CLI flags apply.

```bash
claude -p "Run the test suite and fix any failures" --allowedTools "Bash,Read,Edit"
```

- **Pipe stdin** like any Unix tool: `cat build-error.txt | claude -p 'explain the root cause' > out.txt`.
  Piped stdin is **capped at 10 MB** (v2.1.128+); over the cap it exits non-zero — write to a file
  and reference the path instead.
- **User-invoked Skills and custom commands work** in `-p`: put `/skill-name` in the prompt string.
  Interactive-dialog commands — **`/config` and `/login` — do NOT work** in `-p`.
- `--continue` resumes the most recent conversation; `--resume <session_id>` a specific one
  (capture it from the JSON `.session_id`). Lookup is scoped to the current project dir + worktrees.
- `--append-system-prompt '<text>'` / `--append-system-prompt-file` adds to the prompt without
  replacing it; `--system-prompt` fully replaces.

### Output formats

`--output-format` ∈ `text` (default) | `json` | `stream-json`.

| Want | Flags | Where the answer is |
|---|---|---|
| Structured metadata + answer | `--output-format json` | `.result`; cost in `.total_cost_usd` (+ per-model breakdown) |
| Conform to a schema | `--output-format json --json-schema '<JSON Schema>'` | `.structured_output` |
| Token-by-token streaming | `--output-format stream-json --verbose --include-partial-messages` | NDJSON events |

```bash
# plain answer
claude -p "Summarize this project" --output-format json | jq -r '.result'

# schema-constrained extraction
claude -p "Extract function names from auth.py" --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'
```

- `stream-json` emits `system/init` (first event: model, tools, MCP, `plugins`/`plugin_errors`)
  and `system/api_retry` (`attempt`, `max_retries`, `error`) events.
- Background Bash tasks started during a `-p` run are killed ~5 s after the final result + stdin
  close (v2.1.163+; previously a never-exiting task held the invocation open forever).

---

## §4. CI lockdown — reproducible, deny-by-default runs

Use `--bare` for CI: it skips auto-discovery of hooks, Skills, plugins, MCP servers, auto-memory,
and CLAUDE.md, so the result is identical on every machine — **only flags you pass take effect.**
It also skips OAuth/keychain; auth must come from `ANTHROPIC_API_KEY` (or `apiKeyHelper` in
`--settings`). Bare mode is the recommended scripted/SDK mode and will become the `-p` default.

```bash
claude --bare -p "Apply lint fixes" --allowedTools "Read,Edit" \
  --permission-mode acceptEdits --max-turns 12
```

| Flag | Effect |
|---|---|
| `--allowedTools 'Bash(git diff *)'` | Permission-rule syntax (see `references/settings-permissions-mcp.md`). Trailing **` *` = prefix match; the SPACE matters** — `Bash(git diff*)` would also match `git diff-index` |
| `--permission-mode dontAsk` | Deny anything outside `permissions.allow` / the read-only command set — locked-down CI default |
| `--permission-mode acceptEdits` | Auto-writes files + auto-approves `mkdir`/`touch`/`mv`/`cp`; other shell/network still needs an allow rule or the run aborts |
| `--permission-mode auto` | Classifier-gated; aborts if the classifier repeatedly blocks |
| `--bare` | Reproducible: no auto-discovery, no OAuth/keychain |
| `--max-turns N` | Cap agent iterations |

Load context explicitly in bare mode: `--settings`, `--mcp-config`, `--agents`, `--plugin-dir` /
`--plugin-url`, `--append-system-prompt(-file)`. **Pipe the diff instead of granting Bash** when
you can — e.g. `git diff main | claude -p "typo linter…"` needs no Bash permission.

---

## §5. GitHub Actions — `@claude` in issues/PRs

1. Run `/install-github-app` once to install the GitHub app + workflow.
2. **Comment `@claude` (NOT `/claude`)** on an issue or PR to trigger it.

The workflow uses **`anthropics/claude-code-action@v1`**, which takes a `prompt` and `claude_args`
(the `mode` is **auto-detected** from context — tag vs. review vs. agent):

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    prompt: "Review this PR for security vulnerabilities"
    claude_args: "--allowedTools Read,Bash(npm test) --max-turns 15"
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

- `claude_args` are the same headless flags from §3–§4 — scope tools and `--max-turns` tightly;
  treat the runner as untrusted (every MCP/external fetch is a prompt-injection boundary, SKILL.md §4).
- For non-GitHub pipelines, drive `claude --bare -p … --output-format json` directly (GitLab CI,
  any runner). Gate the job on the exit code / `.result`.

---

## Sources

- [Output styles](https://code.claude.com/docs/en/output-styles)
- [Customize your status line](https://code.claude.com/docs/en/statusline)
- [Run Claude Code programmatically (headless)](https://code.claude.com/docs/en/headless)
