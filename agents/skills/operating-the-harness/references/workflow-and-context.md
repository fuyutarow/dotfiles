# Session workflow & context-window management

> Running one session well: the Explore→Plan→Code→Commit loop, plan mode, model/effort
> selection, course-correction (`/rewind`), context hygiene (`/clear`/`/compact`/`/btw`), and
> the prompt-specificity moves that cut reads and re-tries. The context window is the
> **fundamental constraint** — performance degrades as it fills, so spend it deliberately.
> Verified against `code.claude.com/docs` (2026-06). Parent: SKILL.md §1–§2.

---

## The loop: Explore → Plan → Code → Commit

| Phase | Mode | What it does |
|---|---|---|
| **Explore** | plan | Read files / run read-only commands, answer questions, make **no** edits |
| **Plan** | plan | Produce a detailed implementation plan; `Ctrl+G` edits it in `$EDITOR` first |
| **Code** | default / acceptEdits / auto | Implement against the plan, run the verify check, iterate |
| **Commit** | default | "commit with a descriptive message and open a PR" |

**Separate research/planning from implementation** — jumping straight to code solves the *wrong*
problem. But planning adds overhead: **skip it when "you could describe the diff in one sentence"**
(typo, log line, rename). Plan when the approach is uncertain, the change is multi-file, or the
code is unfamiliar.

### Plan mode controls

| Action | Effect |
|---|---|
| `Shift+Tab` | Cycle `default` → `acceptEdits` → `plan` (status bar shows mode) |
| `/plan` | Prefix a **single** prompt to run it in plan mode |
| `claude --permission-mode plan` | Start in plan mode |
| `"permissions": {"defaultMode": "plan"}` | Make plan mode the project default (`.claude/settings.json`) |
| `Ctrl+G` | Open the proposed plan in `$EDITOR` to edit before approving |
| `Shift+Tab` (again) | Leave plan mode **without** approving a plan |

Plan mode reads + explores but never edits source; permission prompts still apply as in `default`.
On approval Claude offers: approve→auto, approve→acceptEdits, approve→review-each-edit, keep
planning, or refine with Ultraplan. Approving exits plan mode and switches to the chosen mode.
Approving also **auto-names the session** from the plan (unless `--name`/`/rename` already set).
With `showClearContextOnPlanAccept` enabled, each approve option also offers to clear planning
context first. (Mode semantics → see references/settings-permissions-mcp.md.)

---

## Model & reasoning depth

### `opusplan` — Opus to plan, Sonnet to execute

```bash
/model opusplan        # opus during plan mode → auto-switches to sonnet for execution
/model opusplan[1m]    # forces the 1M-token context window in BOTH phases
```

The plan-mode Opus phase reuses the `opus` context window; on Max/Team/Enterprise where Opus is
auto-upgraded to 1M, `opusplan` gets the upgrade in plan mode too. Use **`opusplan[1m]`** to force
1M in both phases when you are *not* on an auto-upgrade tier. If `availableModels` excludes Opus,
`opusplan` stays on Sonnet in plan mode instead of switching.

Set the model via `/model <alias>` (saves as default, v2.1.153+), `claude --model <alias>`,
`ANTHROPIC_MODEL`, or the `model` settings field. Aliases track the provider's *recommended*
version and MOVE: on the Anthropic API `opus`→**Opus 5** (v2.1.219+; it was Opus 4.8 from
v2.1.154), `sonnet`→**Sonnet 5**. Pin with a full name (`claude-opus-5`) or
`ANTHROPIC_DEFAULT_OPUS_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL`. Resumed sessions
(`--continue`/`--resume`) keep their saved model.

### Reasoning: `ultrathink` (one-off) vs `/effort` (session) vs `ultracode`

| Lever | Scope | Values |
|---|---|---|
| `ultrathink` (any word in prompt) | this turn only — adds an in-context instruction; **API effort unchanged** | on/off |
| `/effort <level>` | session (persists, except `max`) | `low` / `medium` / `high` / `xhigh` / `max` |
| `ultracode` | session ONLY — a Claude Code setting, **not** a model effort level | sends `xhigh` **and** has Claude orchestrate dynamic workflows |

- **The old `think` / `think hard` / `think harder` / `think more` ladder is DEAD** — those phrases
  pass through as ordinary prompt text and are NOT recognized as keywords. Only `ultrathink` is.
- **Default effort is `high` on every model that supports effort, except Opus 4.7 (`xhigh`).**
  Opus 4.6 / Sonnet 4.6 lack `xhigh`; an unsupported level falls back to the highest supported
  level at or below it (`xhigh` runs as `high` on Opus 4.6). Enterprise orgs can cap levels per
  model per role — above the cap, `--effort`/`/effort` runs AT the cap (silently under `json`,
  `stream-json`, and background agents).
- **The same level name is NOT the same amount across models** — the scale is calibrated per
  model. One global level applied to a mixed roster is not a coherent policy.
- **Precedence: `CLAUDE_CODE_EFFORT_LEVEL` > your configured level > the model default.**
  Skill/subagent frontmatter `effort:` overrides the SESSION level while that skill or subagent
  runs, but never the env var. That frontmatter field is the ONLY per-role effort lever: the
  Agent tool has no `effort` parameter, and agent-team teammates INHERIT the lead's effort
  (while NOT inheriting its model).
- Set it via `/effort` (no arg = slider, `auto` = model default), `--effort`,
  `CLAUDE_CODE_EFFORT_LEVEL`, the `effortLevel` setting (`low`–`xhigh` only), or the model
  picker's arrows. `max` is session-only unless set through the env var, and is prone to
  overthinking — test first.
- **`ultracode` gotcha**: neither `effortLevel` nor `CLAUDE_CODE_EFFORT_LEVEL` accepts
  `ultracode` (use `/effort ultracode`, `--effort ultracode`, or `"ultracode": true` in
  settings). With ultracode on, requests run at `xhigh` — so a persisted `effortLevel: "low"`
  alongside it is silently dead config. Conversely, setting `CLAUDE_CODE_EFFORT_LEVEL` to
  anything other than `xhigh` runs at that level and turns ultracode's workflow orchestration
  OFF. Verify the live value rather than reading the setting: hooks receive `CLAUDE_EFFORT`, and
  the statusline JSON carries `effort.level`.
- **Opus 5 carry-over trap**: Fable 5 / Opus 4.8 / Opus 4.7 apply their own default on first run
  and HOLD it across sessions until you choose explicitly. **Opus 5 has no such hold** — a level
  you last set for another model carries straight over.

---

## Course-correct: stop, rewind, summarize

| Key / command | Effect |
|---|---|
| `Esc` | Stop Claude mid-action — **context is preserved**, redirect immediately |
| `Esc Esc` or `/rewind` | Open the rewind menu (only when prompt input is **empty**; otherwise `Esc Esc` clears the input) |
| `"undo that"` | Ask Claude to revert its own changes |

Every prompt creates a **checkpoint**; checkpoints persist across sessions (cleaned up with the
session after 30 days). The rewind menu lists each prompt you sent — pick a point, then:

| Option | Effect |
|---|---|
| **Restore code and conversation** | revert both to that point |
| **Restore conversation** | rewind the message, **keep current code** |
| **Restore code** | revert files, **keep the conversation** |
| **Summarize from here** | compress the selected message + everything after into a summary (frees context) |
| **Summarize up to here** | compress everything *before* the selection; keep later messages intact |
| **Never mind** | back out, no change |

**Checkpoints track ONLY Claude's file-edit-tool changes.** They do **NOT** track files modified by
Bash (`rm`, `mv`, `cp`), external edits, or other concurrent sessions. **Not a git replacement** —
treat checkpoints as "local undo," git as permanent history. To branch off and try an alternative
while preserving the original session, use `claude --continue --fork-session` instead of summarize.

---

## Context hygiene — the fundamental constraint

Context holds the whole conversation: every message, every file read, every command output. It
fills fast and **performance degrades as it fills** (Claude "forgets" earlier instructions, makes
more mistakes). Manage it aggressively.

| Tool | Use |
|---|---|
| `/clear` | Reset context **between unrelated tasks** — the single highest-leverage hygiene move |
| `/compact '<focus>'` | Summarize now with a focus, e.g. `/compact 'Focus on the API changes'`. Auto-compaction near the limit preserves code patterns, file states, key decisions |
| `Esc Esc` → Summarize from/up to here | Targeted compaction of one side of a checkpoint (vs `/compact`'s whole-conversation) |
| `/btw <question>` | Throwaway question — answer appears in a dismissible overlay and **never enters conversation history**, so context doesn't grow |
| `/rename <name>` + `--continue` / `--resume` | Name sessions like branches (`oauth-migration`); resume across sittings without re-explaining |

- **Tune compaction survival in CLAUDE.md:** e.g. *"When compacting, always preserve the full list
  of modified files and any test commands."*
- **After 2 failed corrections on the same issue, `/clear` and rewrite a sharper prompt** with what
  you learned — a clean session beats a long degraded one (SKILL.md §4 anti-patterns).
- **Unscoped "investigate" reads hundreds of files** → scope it, or delegate to a subagent so the
  exploration burns *its* context, not yours (→ references/subagents-and-parallelism.md).

### Watch the constraint

| Tool | Shows |
|---|---|
| `/context` | What is consuming the window right now — **including MCP tool definitions** (a frequent silent hog) |
| `/usage` | Per-feature token breakdown |
| custom `statusLine` | Live `context_window.used_percentage` — color it **green <70 / yellow / red 90+**. Runs locally, **zero API tokens** |

The statusLine receives session JSON on stdin (read `context_window.used_percentage`); pair it with
`/context` when a number looks off. (Wiring a statusLine → see references/headless-and-ci.md.)

---

## Prompt specificity — precision cuts reads + corrections

The more precise the prompt, the fewer corrections. Four moves:

| Move | Vague | Specific |
|---|---|---|
| **Scope the task** (file + scenario + test prefs) | "add tests for foo.py" | "write a test for foo.py covering the logged-out edge case. avoid mocks." |
| **Point to a pattern** | "add a calendar widget" | "look at existing widgets on the home page — `HotDogWidget.php` is a good example. Follow that pattern…" |
| **Symptom + location + fix-shape** | "fix the login bug" | "login fails after session timeout. check `src/auth/` token refresh. write a failing test that reproduces it, then fix" |
| **Point to a source** | "why is this API weird?" | "look through `ExecutionFactory`'s git history and summarize how its api came to be" |

**Feed rich content directly** (cheaper than describing it):

| Channel | How |
|---|---|
| Files | `@path/to/file` — Claude reads it before responding |
| Images / mocks | paste or drag-drop into the prompt |
| File contents | `cat error.log \| claude` — pipe stdin straight in |
| Docs/APIs | give the URL; `/permissions` to allowlist frequent domains |

Vague prompts are fine when *exploring* ("what would you improve here?") and can afford
course-correction — but not for committed work.

---

## Larger features: interview → SPEC.md → fresh session

For features bigger than one sitting, do **not** prompt blind. Run an interview first:

```text
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.
Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask
obvious questions — dig into the hard parts I might not have considered. Keep interviewing
until we've covered everything, then write a complete spec to SPEC.md.
```

Then **execute it in a FRESH session** — clean context focused on implementation, with the written
spec to reference. The most useful specs are **self-contained**:

1. **Name the files and interfaces** involved.
2. **State what is out of scope.**
3. **End with an end-to-end verification step** that proves the feature works.

Time spent making the spec precise pays off more than time watching the implementation. This is the
multi-file/uncertain branch of SKILL.md §0's "match tool weight to task size" — pair it with the
verification loop (SKILL.md §2): the spec's final e2e step *is* the machine-readable pass/fail.

---

## Sources

- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)
- [Checkpointing](https://code.claude.com/docs/en/checkpointing)
- [Model configuration](https://code.claude.com/docs/en/model-config)
