# Slash commands, Skills & writing tool/MCP descriptions

> Authoring `/`-invokable commands & Skills, controlling who triggers them, and writing
> tool/MCP descriptions an agent can actually use. Parent: `SKILL.md §4` (anti-patterns) +
> the reference index. Siblings: `references/settings-permissions-mcp.md` (permission rules,
> MCP setup), `references/subagents-and-parallelism.md` (`context: fork` execution).

## Commands and Skills are UNIFIED

A file at `.claude/commands/deploy.md` **and** a skill at `.claude/skills/deploy/SKILL.md`
**both** produce `/deploy` and work the same way. On a name clash **the skill wins**.

| Layout | Command name from | Can carry `references/`+`scripts/`? | Verdict |
|---|---|---|---|
| `.claude/skills/<name>/SKILL.md` | directory name | **Yes** | **First choice** |
| `.claude/commands/<name>.md` | filename (no `.md`) | No | legacy; still works |

**Prefer the skill folder.** It is the only layout with progressive disclosure (siblings load
on demand) and bundled scripts. Across-level precedence: enterprise > personal
(`~/.claude/skills/`) > project (`.claude/skills/`) > bundled. Plugin skills are namespaced
`plugin-name:skill-name` and never clash. Nested `.claude/skills/` (monorepo) co-exist under a
directory-qualified name, e.g. `apps/web:deploy`; `/deploy` still runs the root one.

## SKILL.md frontmatter

`description` is the only **recommended** field (falls back to the first paragraph if omitted);
`name` defaults to the directory name. **All fields are optional.**

```yaml
---
name: my-skill                 # display label; does NOT change the /command (dir name does)
description: What it does and WHEN to use it.   # this is a TRIGGER, not a summary
when_to_use: trigger phrases, example requests  # appended to description; same cap
disable-model-invocation: true # user-only (good for side-effecting /deploy, /commit)
user-invocable: false          # Claude-only background knowledge (hidden from / menu)
allowed-tools: Bash(git add *) Bash(git commit *)   # pre-approve (does NOT restrict)
disallowed-tools: AskUserQuestion                   # remove from pool; clears next message
arguments: [issue, branch]     # named positional args → $issue, $branch
argument-hint: "[issue-number]"  # autocomplete hint
model: inherit                 # /model values or `inherit`; applies for the turn, not saved
effort: high                   # low|medium|high|xhigh|max; overrides session effort this turn
context: fork                  # run in an isolated subagent (see below)
agent: Explore                 # subagent type when context: fork (default general-purpose)
paths: "src/**/*.ts"           # glob: auto-activate ONLY when matching files are in play
hooks: {}                      # hooks scoped to this skill's lifecycle
shell: bash                    # bash (default) | powershell
---
```

**Description = a trigger for the model, not a summary.** Lead with the key use case, write in
third person, pack the keywords a user would naturally say. The combined `description` +
`when_to_use` is **truncated at 1,536 characters** in the skill listing (configurable via
`maxSkillDescriptionChars`) — put the load-bearing use case first.

**Keep the body under ~500 lines.** Once invoked it enters the conversation as one message and
**stays for the rest of the session** (Claude Code does not re-read it on later turns) — every
line is a *recurring* token cost. State what to do, not how/why; same conciseness bar as
CLAUDE.md. Write standing instructions, not one-time steps.

## Progressive disclosure — what loads when

| Stage | What is in context |
|---|---|
| Session start | `name` + `description` only (one ~1%-of-window listing budget) |
| On invoke (`/name` or auto) | the full `SKILL.md` body, rendered |
| On demand | sibling `references/*.md`, `scripts/` — only when Claude *reads/runs* them |

Reference siblings from the body so Claude knows what each holds and when to open it
(`see [reference.md](reference.md)`). Reference bundled scripts with **`${CLAUDE_SKILL_DIR}`**
so they resolve at personal/project/plugin level regardless of cwd:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/visualize.py .
```

Other substitutions: `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}` (reports `xhigh` for ultracode).

> Exception: a subagent with a `skills:` field gets the **full** skill body injected at
> startup, not just the description (→ `references/subagents-and-parallelism.md`).

## Invocation control

| Frontmatter | You invoke | Claude invokes | Description in context | Use for |
|---|---|---|---|---|
| (default) | Yes | Yes | always | reference content |
| `disable-model-invocation: true` | Yes | **No** | **not** loaded | side-effecting `/commit`, `/deploy`, `/send-slack-message` |
| `user-invocable: false` | **No** | Yes | always | background knowledge (`legacy-system-context`) |

`disable-model-invocation: true` also removes the skill from Claude's context entirely and
stops it being preloaded into subagents — it is the only field that blocks *programmatic*
(Skill-tool) invocation. `user-invocable: false` controls **menu visibility only**, not Skill-tool
access. To change visibility without editing the SKILL.md, use the `skillOverrides` setting
(`"on"` / `"name-only"` / `"user-invocable-only"` / `"off"`; the `/skills` menu writes it to
`.claude/settings.local.json`).

### Arguments & dynamic context

| Token | Expands to |
|---|---|
| `$ARGUMENTS` | full arg string as typed (if absent, args appended as `ARGUMENTS: <value>`) |
| `$ARGUMENTS[N]` / `$N` | 0-based positional arg (`$0` first); shell-style quoting — quote multi-word values |
| `$name` | named arg from `arguments:` list, mapped by position |

Inject **dynamic context** with `` !`cmd` `` — preprocessed and inlined **before Claude sees the
output** (Claude never runs it; it sees only the result). Only recognized at line start or after
whitespace (`` KEY=!`cmd` `` stays literal). Multi-line: a ` ```! ` fenced block. Substitution
runs once and output is not re-scanned. Pull files with `@file` references.

```yaml
---
description: Summarize uncommitted changes and flag risks. Use when the user asks what changed or wants a commit message.
---
## Current changes
!`git diff HEAD`
## Instructions
Summarize the diff above in 2-3 bullets, then list risks (missing error handling, hardcoded values).
```

Disable shell execution org-wide with `"disableSkillShellExecution": true` (best in managed
settings; bundled/managed skills are exempt).

## Run a skill in an isolated subagent — `context: fork`

`context: fork` runs the **SKILL.md body as the subagent's prompt** in a fresh context with **no
conversation history**. `agent:` picks the type (`Explore` / `Plan` / `general-purpose`, or any
`.claude/agents/*.md`; default `general-purpose`). `Explore`/`Plan` skip CLAUDE.md + git status.

> **Only for skills with one explicit task.** A guidelines-only skill ("use these API
> conventions") forked into a subagent gives it instructions but no actionable prompt — it
> returns nothing useful. Reference content must run **inline**.

## Diagnose triggering — auto-trigger is NOT guaranteed

Auto-activation is **description-matched**, never guaranteed. **Verify invocation yourself**
(watch for the skill firing; don't assume). Diagnostics, in order:

1. Ask **"What skills are available?"** — confirms the skill is listed at all.
2. Run **`/doctor`** — shows how many descriptions are **shortened or dropped** and which.
3. Skill *names* are always listed, but **descriptions share a ~1% context budget**; when it
   overflows, the **least-used skills' descriptions drop first**, stripping match keywords.

Raise the budget: `skillListingBudgetFraction` (e.g. `0.02` = 2%) or
`SLASH_COMMAND_TOOL_CHAR_BUDGET` (fixed char count). Free budget: set low-priority skills to
`"name-only"` in `skillOverrides`. **Restrict** Claude's access via permission rules:
`Skill` (deny all), `Skill(name)` (exact), `Skill(name *)` (prefix-with-args). A few built-ins
(`/init`, `/review`, `/security-review`) are also Skill-tool-callable; `/compact` is not.

**Triggers too often?** Make the description more specific, or add `disable-model-invocation: true`.

## Authoring guidance — compose, don't railroad

- Give **goals + constraints**, not a rigid step-by-step script — let Claude adapt. Over-specified
  steps railroad it into worse paths than its own.
- Include a **"Gotchas" section** for the non-obvious failure modes.
- **Bundle scripts** under `scripts/` and call them with `${CLAUDE_SKILL_DIR}` so Claude
  *composes* a known-good tool rather than reconstructing logic each run.
- Push large reference material to `references/*.md`; keep `SKILL.md` a focused entrypoint.

## Writing tool / MCP descriptions

A tool/MCP description is loaded for the whole session and is the agent's *only* spec for the
tool — write it **like an onboarding doc for a new hire**: make implicit knowledge explicit
(specialized query formats, niche terminology, relationships between resources).

> **The test:** if a human engineer can't tell from the description which tool to use, neither
> can the agent.

| Lever | Do | Don't |
|---|---|---|
| **Param names** | `user_id` (unambiguous) | `user` |
| **Consolidate** | one `schedule_event`; `search_logs` (returns only relevant rows) | `list_users`+`list_events`+`create_event`; `read_logs` |
| **Namespace** | `asana_search`, then by resource `asana_projects_search`, `asana_users_search` | flat undifferentiated names |
| **Identifiers** | return semantically meaningful / human-readable IDs (or a 0-indexed scheme) | raw alphanumeric UUIDs (induce hallucination) |
| **Verbosity** | a `ResponseFormat` enum `"concise"` / `"detailed"` | always-maximal payloads |
| **Large results** | pagination + range selection + filtering + truncation, sane defaults | dump everything |
| **Errors** | prompt-engineer them: specific + actionable, with an example of correct input | opaque codes / raw tracebacks |

Claude Code **caps tool responses at ~25,000 tokens** — design pagination/filtering/truncation so
a single call stays well under that, and surface a `ResponseFormat` so the agent can ask for the
cheap form first and the detailed form only when it needs identifiers for downstream calls. Every
MCP server that fetches external content is a prompt-injection boundary (→ `SKILL.md §4`).

## Sources

- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Commands reference](https://code.claude.com/docs/en/commands)
- [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
