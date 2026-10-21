# Subagents, forks, worktrees & parallel execution

> When to spend a separate context window (or a separate checkout) on a side task, and how.
> Loaded from SKILL.md §0 (decision reflex) and §2 gate 4 (fresh-context review). Default is
> **one general-purpose agent in the main session** — see §"Don't fan out by default."

## §1. Subagent vs fork — the one distinction that matters

A **subagent** runs in its **own isolated context window**: it does **NOT** see your conversation
history, the files you've already read, or the skills you've already invoked. Claude composes a
delegation message summarizing the task; the subagent works from that and returns **only a
summary**. This is the fix for "infinite exploration" and the way to protect main context — the
verbose tool output stays in the subagent's window, never yours.

A **fork** (`/fork`) is the variant that **INHERITS the full conversation** — same system prompt,
tools, model, and message history — and **shares the parent's prompt cache** (so its first request
is cheaper than spawning a fresh subagent). Its own tool calls still stay out of your conversation;
only the final result returns. Use a fork when a named subagent would need too much background to
be useful, or to try several approaches in parallel from the same starting point.

| | Subagent (fresh) | Fork (`/fork`) |
|---|---|---|
| Context | Fresh, isolated — prompt only | **Full conversation history** |
| System prompt / tools / model | From definition file | Same as main session |
| Prompt cache | Separate | **Shared with main session** |
| Spawn nested? | Yes (Agent in `tools`) | No — a fork cannot spawn another fork |

- Spawned via the **`Agent` tool** (renamed from `Task` in **v2.1.63**; `Task(...)` still aliases).
- `"use subagents"` / "research X with separate subagents" **does NOT inherit your context** — each
  starts blank. Restate anything load-bearing in the delegation prompt.
- `/fork <directive>` runs in a background panel; result lands as a message. Default-on since
  **v2.1.161** (needs `CLAUDE_CODE_FORK_SUBAGENT=1` on v2.1.117–2.1.160). Set the env var to `0` to
  hard-disable everywhere (interactive, `claude -p`, SDK).
- Quick question about what's *already* in context → use **`/btw`** (sees full context, no tools,
  answer discarded), not a subagent.

## §2. `.claude/agents/<name>.md` frontmatter

YAML frontmatter + Markdown body (the body is the system prompt). Created via `/agents` (takes
effect immediately) or by hand (restart the session to load). Only **`name`** + **`description`**
are required.

```markdown
---
name: code-reviewer            # required: lowercase + hyphens; hooks see it as agent_type
description: Reviews the diff for correctness gaps   # required: WHEN to delegate
tools: Read, Grep, Glob        # allowlist; inherits ALL if omitted
disallowedTools: Write, Edit   # denylist; applied FIRST, then tools resolves against the rest
model: inherit                 # sonnet|opus|haiku|fable|<full-id>|inherit (default: inherit)
permissionMode: default        # default|acceptEdits|auto|dontAsk|bypassPermissions|plan
skills: [api-conventions]      # PRELOAD full skill content at startup (not just description)
memory: project                # user|project|local — persistent agent-memory dir, cross-session
isolation: worktree            # run in a temp git worktree (see §5)
---
You are a senior code reviewer. Report correctness/requirement gaps only.
```

| Field | Notes |
|---|---|
| `tools` | Allowlist. **Read-only reviewer: `tools: Read, Grep, Glob`** (no Edit/Write → cannot modify). Prefer `skills:` over listing `Skill` here. |
| `disallowedTools` | Removed from inherited *or* specified list; applied **before** `tools`. A tool in both is removed. Supports `mcp__<server>` / `mcp__*`. |
| `model` | Default `inherit`. Per-invocation `model` and `CLAUDE_CODE_SUBAGENT_MODEL` env override the frontmatter. |
| `permissionMode` | Parent `bypassPermissions`/`acceptEdits`/`auto` takes precedence and cannot be overridden. |
| `memory` | `user`→`~/.claude/agent-memory/<name>/`, `project`→`.claude/agent-memory/<name>/`, `local`→`.claude/agent-memory-local/<name>/`. `project` is the recommended default. |
| `isolation` | `worktree` → isolated repo copy, branched from default branch unless `worktree.baseRef: "head"`. |

Scope precedence (highest first): **managed settings → `--agents` JSON (session) → `.claude/agents/`
(project, check in) → `~/.claude/agents/` (user) → plugin `agents/`**. Identity is the `name`
field, not the filename or subfolder. Plugin subagents **ignore** `hooks`/`mcpServers`/`permissionMode`.

## §3. Built-in subagents — and the CLAUDE.md trap

| Agent | Model | Tools | Use |
|---|---|---|---|
| **Explore** | **Haiku** (fast, cheap) | Read-only (no Write/Edit) | File discovery, code search. Pass thoroughness: `quick`/`medium`/`very thorough`. |
| **Plan** | inherit | Read-only | Research during plan mode; keeps exploration out of the read-only main thread. |
| **general-purpose** | inherit | **All tools** | Complex multi-step work needing both exploration and edits. |

> **Trap: Explore and Plan SKIP your CLAUDE.md files AND the parent git-status snapshot** (to stay
> fast/cheap). Every *other* built-in and custom subagent loads both. The main conversation reads
> their results *with* full CLAUDE.md context, so most rules don't need to reach the subagent — but
> if a rule is load-bearing for the search itself (e.g. **"ignore `vendor/`"**), **restate it in the
> delegation prompt.** There is no field to make them load CLAUDE.md.

Block one built-in: `permissions.deny: ["Agent(Explore)"]`. Block all delegation: deny the `Agent`
tool. Headless/SDK: `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`.

## §4. Adversarial review & writer/reviewer splits (closes §2's loop)

The cheapest fresh-context review (SKILL.md §2 gate 4): a subagent that sees **only the diff +
criteria**, never the conversation that produced the code — so it can't rationalize its own work.

- **Run `/code-review`**, or delegate: *"review the diff against `PLAN.md` — report gaps, not style."*
- **Caveat (mandatory):** tell it to **flag ONLY correctness / requirement gaps**, or it
  over-engineers and invents "improvements." Bias toward fewer, high-confidence findings.
- **Writer/Reviewer split:** one session writes code; a **fresh** one reviews it (unbiased toward
  code it didn't write).
- **TDD split:** one session writes the failing tests; another writes code to pass them — the tests
  are the machine-readable pass/fail (SKILL.md §2).
- Make it read-only: `tools: Read, Grep, Glob, Bash` (Bash for `git diff`), no Edit/Write.

## §5. Parallel surface matrix — lightest to heaviest

Reach for the lightest tier that isolates what actually collides (context vs files vs whole sessions).

| Tier | Mechanism | Isolates | Cost / when |
|---|---|---|---|
| **Subagent** | `Agent` tool, in-session | **Context** (returns summary) | Lightest. Verbose side work; results still consume main context on return. |
| **Worktree** | `claude --worktree <name>` (`-w`) | **Files** | Separate checkout under `.claude/worktrees/<name>/`, branch `worktree-<name>`. **Gitignore `.claude/worktrees/`.** |
| **Agent view** | `claude agents` | Many independent sessions | Monitor parallel sessions from one place. |
| **Agent teams** | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | Sessions that talk to each other | **Experimental.** Shared task list; enables `SendMessage` (also what lets you *resume* a subagent). |
| **`/workflows`** | a script | Cross-checks many subagents | Heaviest orchestration; a script, not a chat. |

**Worktree specifics (verified):**
- `claude --worktree feature-auth` → `.claude/worktrees/feature-auth/` on branch `worktree-feature-auth`.
  Omit the name for an auto-name (`bright-running-fox`); pass `"#1234"` to branch from a PR.
- Base branch = `origin/HEAD` (clean, matches remote). Set `worktree.baseRef: "head"` in settings to
  carry unpushed commits — useful when isolating subagents that operate on in-progress work. Accepts
  only `"fresh"` or `"head"`.
- `.worktreeinclude` (`.gitignore` syntax) copies *gitignored* files (e.g. `.env`) into each new worktree.
- Subagent worktrees (`isolation: worktree`) auto-clean if the subagent made no changes; `--worktree`
  sessions with `-p` are **not** auto-cleaned (no exit prompt) — `git worktree remove`.
- Nested subagents (v2.1.172+): a subagent can spawn its own subagents (`Agent` in `tools`); only the
  top-level summary returns. Background subagents at depth 5 lose the `Agent` tool (runaway guard).

## §6. Headless fan-out

```bash
# Fan out over files in a for-loop; test on 2-3 files FIRST, then widen.
for f in $(git diff --name-only main); do
  claude -p "fix lint in $f and run the file's tests" \
    --allowedTools "Edit,Bash(git commit *)"
done

# Reproducible CI: --bare skips auto-discovery (no hooks/skills/MCP/CLAUDE.md from the machine).
claude --bare -p "Summarize staged changes" --allowedTools "Read,Bash(git diff *)"

# Parse the result field out of JSON.
claude -p "Summarize this project" --output-format json | jq -r '.result'
```

- `--allowedTools` uses **permission-rule syntax**: the space in `Bash(git commit *)` matters —
  `Bash(git commit*)` would also match `git commit-tree`.
- `--bare` skips OAuth/keychain; auth must come from `ANTHROPIC_API_KEY` or an `apiKeyHelper` in
  `--settings`. Load context explicitly: `--agents <json>`, `--mcp-config`, `--append-system-prompt`.
  It is the recommended mode for scripted/SDK calls and will become the `-p` default.
- `--output-format json` → text in `.result`; with `--json-schema`, structured data in
  `.structured_output`; metadata includes `total_cost_usd` for per-call spend tracking.
- For a locked-down run without listing every tool, use `--permission-mode dontAsk` (denies anything
  not in `permissions.allow` or the read-only set).
- User-invoked skills/commands work in `-p`: put `/skill-name` in the prompt string. `/config`,
  `/login` (interactive dialogs) do not.

## §7. Don't fan out by default

Anthropic's **"effective harnesses for long-running agents"** research is explicitly **uncertain
that a multi-agent setup beats a single general-purpose agent** (a plain loop: progress file + git
history + one feature at a time + self-verify). Parallelism buys *isolation*, not *quality* — and
every subagent that returns a detailed result spends main context on the way back. Reach for a
subagent to **protect context** (verbose search/logs) or **enforce constraints** (read-only review),
or a worktree to **prevent file collisions** — not as a reflex. See SKILL.md §0 "match tool weight to
task size" and §4 anti-pattern "heavyweight frameworks on small/solo tasks."

## Sources

- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees)
- [Run Claude Code programmatically (headless)](https://code.claude.com/docs/en/headless)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
