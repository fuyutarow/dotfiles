# Memory, CLAUDE.md load order & path-scoped rules

> How every memory file resolves into context, which load at launch vs on demand, how to
> *defer* tokens instead of pretending to, and the first move when "Claude ignores my rule."
> Parent: SKILL.md §1 (CLAUDE.md discipline). Two memory systems exist — **CLAUDE.md** (you
> write, instructions) and **auto memory** (Claude writes, learnings); both load every session,
> both are **context, not enforced config**. To *block* an action, use a hook — see
> `references/hooks.md`, not this file.

## Load order — broadest → narrowest, narrower wins (loaded last)

All discovered files are **concatenated**, never overridden; later = higher effective priority.

| # | Scope | Path(s) | When |
|---|---|---|---|
| 1 | **Managed policy** | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md` · Linux/WSL `/etc/claude-code/CLAUDE.md` · Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | launch; **cannot be excluded** |
| 2 | **User** | `~/.claude/CLAUDE.md` | launch |
| 3 | **Project** | `./CLAUDE.md` **or** `./.claude/CLAUDE.md` | launch (if at/above cwd) |
| 4 | **Local** | `./CLAUDE.local.md` | launch; **gitignore it** |

- **Ancestor walk:** Claude walks up from cwd, loading every `CLAUDE.md` + `CLAUDE.local.md`.
  Ordered root → cwd, so the file *closest to where you launched* is read **last** (highest
  priority). Within a directory, `CLAUDE.local.md` is appended **after** `CLAUDE.md`.
- **Subdir files load on demand** — `CLAUDE.md`/`CLAUDE.local.md` *below* cwd are NOT loaded at
  launch; they enter context only when Claude **reads a file in that subdirectory**.
- **`--add-dir` dirs:** their CLAUDE.md is **not** loaded by default. Opt in with
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` (loads `CLAUDE.md`, `.claude/CLAUDE.md`,
  `.claude/rules/*.md`, `CLAUDE.local.md`; `CLAUDE.local.md` skipped if `--setting-sources`
  excludes `local`).

## Path-scoped rules — `.claude/rules/*.md`

The real token-deferral mechanism for *conditional* knowledge. One topic per file
(`testing.md`, `api-design.md`); discovered **recursively** (subdirs `frontend/`, `backend/` OK).

```markdown
---
paths:
  - "src/api/**/*.ts"
  - "src/**/*.{ts,tsx}"
  - "tests/**/*.test.ts"
---
# API Development Rules
- All endpoints must include input validation
- Use the standard error response format
```

| Has `paths:`? | Loads | Priority |
|---|---|---|
| **Yes** | only when Claude **READS** a matching file (not on every tool use) | conditional |
| **No** | at launch, unconditionally | **same as `.claude/CLAUDE.md`** |

| Glob | Matches |
|---|---|
| `**/*.ts` | all `.ts` in any directory |
| `src/**/*` | everything under `src/` |
| `*.md` | markdown in project root only |
| `src/components/*.tsx` | components in one directory |

- **User-level rules** `~/.claude/rules/` apply to every project, load **before** project rules
  → project rules win.
- **Symlinks supported** for sharing across projects (circular links detected, handled):
  ```bash
  ln -s ~/shared-claude-rules .claude/rules/shared
  ln -s ~/company-standards/security.md .claude/rules/security.md
  ```
- **Rules vs Skills:** rules load every session (or on file match); a **Skill** loads only on
  invoke. Truly task-specific procedures → Skill (see `references/commands-and-skills.md`).

## `@path` imports — organization, NOT context savings

`@path/to/file` (relative resolves to the *importing* file, not cwd; absolute OK) **expands and
loads at launch** alongside its CLAUDE.md. Recursive imports allowed, **max 4 hops**.

```text
See @README for overview and @package.json for npm commands.
- git workflow @docs/git-instructions.md
- @~/.claude/my-project-instructions.md   # shared across worktrees (home-dir, not gitignored-per-worktree)
```

> **Do not** use `@import` "to save context" — imported bytes count at launch the same as inline.
> To actually *defer* tokens, use **path-scoped `.claude/rules/*.md`** or a **Skill**.
> First external import in a project triggers an approval dialog; declining disables it silently.

## `/memory` — the primary "why isn't my rule followed?" tool

`/memory` lists **every** loaded `CLAUDE.md`, `CLAUDE.local.md`, and rules file in the current
session, toggles auto memory, and links the auto-memory folder. Debug order:

1. **`/memory`** — file not listed ⇒ Claude can't see it (wrong location, or subdir not yet read).
2. Confirm the file is at/above cwd (or the matching file was read, for path-scoped rules).
3. Make instructions **specific** ("Use 2-space indentation" > "format nicely").
4. Hunt **conflicting** rules across files — Claude picks one arbitrarily.
5. Still must-happen-every-time? It's a **hook**, not memory (`references/hooks.md`).

The **`InstructionsLoaded` hook** logs exactly *what* loaded, *when*, and *why* — use it to debug
path-scoped rules and lazy subdir loads. For system-prompt-level text use
`--append-system-prompt` (must pass every invocation; for scripts, not interactive).

## `/compact` survival

| File | Survives `/compact`? |
|---|---|
| **Project-root CLAUDE.md** | Yes — re-read from disk and re-injected |
| **Nested (subdir) CLAUDE.md** | **No** — reloads only on next read of a file there |
| **Conversation-only instruction** | No — lost; move it into CLAUDE.md to persist |

Add a **`# Compact instructions`** heading to CLAUDE.md to steer what compaction preserves (e.g.
"preserve modified files + the test commands"). If a rule vanished post-compact, it was either
conversation-only or in a not-yet-reloaded nested file.

## Auto memory — Claude's own notes (v2.1.59+, on by default)

Claude writes these itself when it judges info reusable (build commands, debugging insights,
preferences). **Machine-local**; shared across all worktrees/subdirs of the same git repo.

- **Path:** `~/.claude/projects/<project>/memory/MEMORY.md` (+ topic files `debugging.md` etc.).
  `<project>` derived from the git repo root (cwd if no repo).
- **Load cap — the real hard limit:** first **200 lines or 25KB of `MEMORY.md`**, whichever
  first, loads every session. Topic files load **on demand** only. (This 200/25KB cap is
  auto-memory's, **not** CLAUDE.md's — CLAUDE.md loads in full regardless of length.)
- **Routing:** "remember X" / "always use pnpm" → **auto memory**. "add this to CLAUDE.md" →
  **CLAUDE.md**. Browse/edit/delete via `/memory` (plain markdown).

| Setting / env | Effect |
|---|---|
| `"autoMemoryEnabled": false` (settings.json) | disable auto memory |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | disable via env |
| `"autoMemoryDirectory": "~/my-dir"` | relocate (abs or `~/`-prefixed; project-scope needs trust dialog) |

## Monorepo & org-wide

- **`claudeMdExcludes`** — skip other teams' ancestor files. Put in **`.claude/settings.local.json`**
  (stays local); **absolute-path globs**; configurable at any settings layer, arrays merge.
  Managed-policy CLAUDE.md **cannot** be excluded.
  ```json
  {
    "claudeMdExcludes": [
      "**/monorepo/CLAUDE.md",
      "/home/user/monorepo/other-team/.claude/rules/**"
    ]
  }
  ```
- **HTML comments stripped (zero tokens):** block-level `<!-- maintainer notes -->` are removed
  before injection — use for human-only notes. Comments **inside code blocks are preserved**, and
  all comments stay visible when the file is opened with Read.
- **Org-wide CLAUDE.md:** deploy the managed-policy file (MDM/Group Policy/Ansible), **or** inline
  via the **`claudeMd`** settings key — honored **only in managed/policy scope** (no effect in
  user/project/local):
  ```json
  { "claudeMd": "Always run `make lint` before committing.\nNever push directly to main." }
  ```
  Split of concerns: technical enforcement → managed `permissions.deny`/`sandbox.enabled`/`env`;
  behavioral guidance → managed CLAUDE.md.

## `/init` & AGENTS.md bridge

- **`/init`** bootstraps CLAUDE.md from a codebase scan; if one exists it *suggests* improvements
  rather than overwriting. It folds in existing **`AGENTS.md`**, `.cursorrules`, `.devin/rules/`,
  `.windsurfrules`.
- **`CLAUDE_CODE_NEW_INIT=1`** enables the interactive multi-phase flow: asks which artifacts
  (CLAUDE.md / skills / hooks), explores via a subagent, asks follow-ups, presents a reviewable
  proposal before writing.
- **Bridge AGENTS.md without duplication** — Claude reads `CLAUDE.md`, *not* `AGENTS.md`. Make
  CLAUDE.md's first line `@AGENTS.md` (then append Claude-specific notes below), or symlink:
  ```bash
  ln -s AGENTS.md CLAUDE.md   # use @AGENTS.md instead on Windows (symlinks need admin)
  ```

## Sources

- [How Claude remembers your project — code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)
