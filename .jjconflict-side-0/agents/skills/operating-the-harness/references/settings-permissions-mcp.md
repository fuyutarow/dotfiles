# settings.json, permissions & MCP

> Where a rule must live to be *enforced* (not advised), how the permission engine actually
> matches, the six modes incl. **auto**, and MCP setup/trust. Parent: `SKILL.md §3`/`§4`.
> The mechanical edit uses the `update-config` skill; this is the *semantics*. Hooks are a
> separate enforcement surface → `references/hooks.md`.

## Settings precedence (high → low)

A **deny at ANY level is irreversible** — no lower or higher level can re-allow it. CLI
`--disallowedTools` can *add* restrictions beyond managed; nothing loosens a deny.

| # | Level | File / source |
|---|---|---|
| 1 | **Managed** (org policy) | MDM / `managed-settings.json` — cannot be overridden, *including by CLI args* |
| 2 | **CLI args** | `--permission-mode`, `--allowedTools`, `--disallowedTools` (session-only) |
| 3 | **Local project** | `.claude/settings.local.json` |
| 4 | **Shared project** | `.claude/settings.json` |
| 5 | **User** | `~/.claude/settings.json` |

Add `"$schema": "https://json.schemastore.org/claude-code-settings.json"` to every settings file
for editor validation. A user-level deny blocks a project-level allow (deny is evaluated before
allow across all scopes — see below).

## permissions object — eval order is deny → ask → allow, first match wins

Specificity does **not** reorder. A broad `Bash(aws *)` deny blocks even a call that also matches
a narrow `Bash(aws s3 ls)` allow — **deny rules cannot carry allowlist exceptions**. Same for
ask vs allow: a matching `ask` prompts even when a more specific `allow` matches. Manage
interactively with `/permissions` (lists each rule and its source file).

A **bare tool name** deny (`"Bash"`, `"WebFetch"`) removes the tool from Claude's context
entirely (`Bash(*)` ≡ `Bash`). A **scoped** deny (`Bash(rm *)`) leaves the tool available and
blocks only matching calls. Permission rules are enforced by Claude Code, **not the model** —
CLAUDE.md cannot change them.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "ask":   ["Bash(git push *)"],
    "deny":  ["Read(.env)", "Bash(curl *)", "WebFetch", "mcp__*"]
  }
}
```

## Bash rules — word boundaries, operators, runners

| Pattern | Matches | Note |
|---|---|---|
| `Bash(ls *)` | `ls -la` but **not** `lsof` | space before `*` = word boundary (prefix + space/EOS) |
| `Bash(ls:*)` | same as `Bash(ls *)` | `:*` suffix ≡ trailing ` *`; recognized only at end |
| `Bash(ls*)` | `ls -la` **and** `lsof` | no boundary |
| `Bash(* install)` | anything ending ` install` | wildcard at any position |
| `Bash(git * main)` | `git push origin main`, `git merge main` | one `*` spans multiple args |

- **Shell-operator aware**: a rule must match **each subcommand independently**. `Bash(safe-cmd *)`
  does **not** authorize `safe-cmd && other-cmd`. Separators: `&&`, `||`, `;`, `|`, `|&`, `&`,
  newline. Approving a compound with "don't ask again" saves one rule per subcommand (≤5).
- **Stripped process wrappers** (so `Bash(npm test *)` covers `timeout 30 npm test`): `timeout`,
  `time`, `nice`, `nohup`, `stdbuf`, and **bare** `xargs` (any-flag `xargs -n1 …` is NOT stripped).
- **env/runner wrappers are NOT argument-stripped**: `direnv exec`, `devbox run`, `mise exec`,
  `npx`, `docker exec`. `Bash(devbox run *)` matches `devbox run rm -rf .` — write
  **`Bash(devbox run npm test)`**, NEVER `Bash(devbox run *)`. One rule per inner command.
- **Always-prompt wrappers** (no prefix rule auto-approves): `watch`, `setsid`, `ionice`, `flock`,
  and `find` with `-exec`/`-delete` — write an exact-match rule for the full command.
- **`Bash(command:rm *)` is ignored with a startup warning** (the canonicalized `command` field
  isn't param-matchable; bypassable by a compound). Use `Bash(rm *)`.
- **Read-only Bash never prompts in any mode**: `ls cat echo pwd head tail grep find wc which diff
  stat du cd` + read-only `git`. Not configurable; add an `ask`/`deny` rule to force a prompt.

## Read/Edit rules — gitignore-style anchors

Four anchor types. **`/Users/...` is project-relative, NOT absolute** — use `//` for a true
absolute path. `Edit` covers all built-in edit tools; `Read` is best-effort across Grep/Glob,
`@file` mentions, and IDE selection context.

| Pattern | Anchor | Example → resolves to |
|---|---|---|
| `//path` | filesystem root (absolute) | `Read(//Users/alice/secrets/**)` |
| `~/path` | home dir | `Read(~/.zshrc)` |
| `/path` | **project root** | `Edit(/src/**/*.ts)` |
| `path` / `./path` | cwd | `Read(*.env)` → `<cwd>/*.env` |

`Read(.env)` ≡ `Read(**/.env)` (bare filename matches at any depth at/under cwd). `*` = within one
segment; `**` = across dirs. A **Read deny blocks `cat`/`head`/`tail`/`sed`** and the built-in file
tools — but **NOT arbitrary scripts** (a Python/Node script opening the file). For OS-level
enforcement across all processes, enable the **sandbox** (`/en/sandboxing`). Symlinks: deny applies
if **either** the link OR its target matches; allow needs **both**.

## URL filtering — deny the network tools, allowlist WebFetch

Bash curl/wget rules are **fragile** — defeated by options-before-URL, `https` vs `http`,
redirects (`curl -L bit.ly/x`), variables (`URL=… && curl $URL`), and extra spaces. Reliable
pattern:

```json
{ "permissions": {
  "deny":  ["Bash(curl *)", "Bash(wget *)"],
  "allow": ["WebFetch(domain:github.com)"]
} }
```

`WebFetch(domain:*.example.com)` matches subdomains at any depth but **not** the apex. **WebFetch
alone does not block network** — if `Bash` is allowed, Claude can still curl any URL; pair with the
deny rules (or sandbox network restrictions). Backstop with a `PreToolUse` hook validating URLs
(→ `references/hooks.md`).

## Permission modes — `defaultMode` (six)

Set `"permissions": { "defaultMode": "..." }`. Cycle `default → acceptEdits → plan` with
`Shift+Tab`. **Protected-path** writes (`.git`, `.claude`, `.mcp.json`, shell rc files, …) are
never auto-approved except under `bypassPermissions`; allow rules do **not** pre-approve them.

| Mode | Runs without asking |
|---|---|
| `default` | reads only |
| `acceptEdits` | reads + working-dir edits + `mkdir touch rm rmdir mv cp sed` (in-scope paths) |
| `plan` | reads only; explores, proposes, does **not** edit source |
| `auto` | everything, gated by a classifier (research preview) — see below |
| `dontAsk` | only pre-approved (`allow` rules + read-only Bash); `ask` rules are **denied**, not prompted |
| `bypassPermissions` | everything; `ask` rules still prompt; `rm -rf /`/`rm -rf ~` still prompt as circuit breaker |

## AUTO mode (v2.1.83+, research preview)

A **separate classifier model**, server-configured and **independent of `/model`** (the
engineering deep dive cites Sonnet 4.6), reviews each non-trivial action before it runs. Decision
order (first match wins): (1) your allow/deny rules resolve immediately *except* protected-path
writes; (2) **reads + working-dir edits auto-approved WITHOUT the classifier**; (3) everything else
→ classifier; (4) on block, Claude gets the reason and tries an alternative.

| Blocked by default | Allowed by default |
|---|---|
| `curl \| bash` (download+exec) | local file ops in working dir |
| exfiltration to external endpoints | installing deps from lockfiles/manifests |
| prod deploys / migrations | reading `.env`, sending creds to their matching API |
| mass cloud-storage deletion | read-only HTTP |
| IAM/repo permission grants | pushing to your start branch or a Claude-created branch |
| **force push, or push to `main`** | |

Boundaries you state in chat ("don't push") are treated as block signals, re-read from the
transcript each check — **lost if compaction drops the message**; use a deny rule for a hard
guarantee. On entering auto, broad code-exec allow rules (`Bash(*)`, `Bash(python*)`, package-run,
`Agent`) are **dropped** and restored on exit; narrow rules like `Bash(npm test)` carry over.
Tool *results* are stripped from the classifier (hostile file content can't steer it). ~17%
false-negative rate. Pauses and resumes prompting after **3 consecutive or 20 total** blocks (not
configurable; `-p` headless aborts instead).

**Requirements**: Claude Code **v2.1.83+** and **Opus 4.6+/Sonnet 4.6** on the Anthropic API.
On **Bedrock/Vertex/Foundry**: only **Opus 4.7/4.8**, and behind
`"env": { "CLAUDE_CODE_ENABLE_AUTO_MODE": "1" }` (var works v2.1.158+). On Team/Enterprise an admin
must enable it first.

**Enable**: `Shift+Tab` (opt-in prompt), `--permission-mode auto`, or
`"permissions": { "defaultMode": "auto" }` — but **only honored from USER settings**
(`~/.claude/settings.json`); **ignored from project/local since v2.1.142** so a repo can't grant
itself auto. **Admin disable**: `permissions.disableAutoMode: "disable"` in managed settings
(overrides the enable var). Define trusted infra (repos/buckets/services) via the
`autoMode.environment` managed setting — inspect defaults with `claude auto-mode defaults`,
configure per `/en/auto-mode-config`.

## Lock out bypass org-wide

```json
{ "permissions": { "disableBypassPermissionsMode": "disable" } }
```

Works from any scope but belongs in **managed settings** (can't be overridden there). Prefer
**auto mode** over `--dangerously-skip-permissions` / `bypassPermissions` everywhere outside an
isolated container/VM (`SKILL.md §4`).

## attribution

Use the **`attribution` object** with `commit` and `pr` keys. The boolean
**`includeCoAuthoredBy` is DEPRECATED** — don't set both.

```json
{ "attribution": { "commit": "🤖 Generated with Claude Code", "pr": "" } }
```

## MCP — prefer CLI tools, scope by trust

**Prefer CLI tools (`gh`/`aws`/`gcloud`) over an MCP server** for context efficiency. Every MCP
server that fetches external content is a **prompt-injection trust boundary** (`SKILL.md §4`):
keep personal-credential servers at **user** scope, **never** in a committed `.mcp.json`; pin
OAuth scopes (`oauth.scopes`, a single space-separated string) to a security-approved subset.

Scopes (precedence high → low: local > project > user; entry used whole, not merged):

| Scope | Loads in | Shared | Stored |
|---|---|---|---|
| `local` (default) | current project only | no | `~/.claude.json` (per-project) |
| `project` | current project only | **yes (committed)** | `.mcp.json` in project root |
| `user` | all your projects | no | `~/.claude.json` |

```bash
# HTTP is the recommended remote transport. SSE is DEPRECATED — use http where available.
claude mcp add --transport http <name> <url>                       # local scope (default)
claude mcp add --transport http paypal --scope project https://mcp.paypal.com/mcp
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"
claude mcp add --env KEY=val --transport stdio name -- npx -y some-mcp-server  # stdio: -- separates
```

`.mcp.json` `type: "streamable-http"` is an alias for `http`. Manage: `claude mcp list` /
`get <name>` / `remove <name>`; `/mcp` in-session for status + OAuth. Project-scoped servers
prompt for approval before first use (`claude mcp reset-project-choices` to reset).

**Env vars**: `MAX_MCP_OUTPUT_TOKENS` (default **25000**; soft warning at 10000 tokens),
`MCP_TIMEOUT` (startup timeout ms, e.g. `MCP_TIMEOUT=10000`), `MCP_TOOL_TIMEOUT` (per-call;
per-server `"timeout"` ms in `.mcp.json` overrides it). Deny all MCP tools with `"deny": ["mcp__*"]`;
allow a whole server with `mcp__<server>__*` (server segment must be glob-free). MCP tool search is
on by default — tune with `ENABLE_TOOL_SEARCH`, exempt a server with `"alwaysLoad": true`.

## Sources

- [Configure permissions](https://code.claude.com/docs/en/permissions)
- [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Settings](https://code.claude.com/docs/en/settings)
