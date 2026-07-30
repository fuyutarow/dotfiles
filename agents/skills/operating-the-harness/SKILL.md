---
name: operating-the-harness
description: >-
  Operate Claude Code itself well — keep CLAUDE.md lean as a context budget, put enforcement in the
  harness (hooks, permissions, a runnable check) so Claude checks its own work instead of you, and
  register every rule at the NARROWEST scope that covers it. Use whenever setting up or auditing a
  .claude/ directory, writing or debugging hooks, permissions, MCP servers, commands, Skills,
  subagents, or a plan-mode / verification / parallel workflow. Also: skill not listed / not
  triggering / スキルが発火しない / listing budget. Cut: skill CONTENT craft — distillation, sibling
  cuts, trigger sets, wording → forging-skills (co-fires; this skill owns the harness contract).
  MANDATORY — read before editing any .claude/ config, memory, or hook file. Three precedence rules
  live inline: (1) CLAUDE.md is a context budget — under 200 lines, lazy-load via path-scoped
  .claude/rules/*.md or Skills, never config-as-prose; (2) give Claude a machine-readable check and
  put hard enforcement in hooks/settings.json, not prose; (3) a rule naming ONE repo belongs in that
  repo's .claude/, never in ~/.claude/ behind a cwd check. Trigger on CLAUDE.md, AGENTS.md,
  .claude/rules, settings.json, ~/.claude, user vs project scope, CLAUDE_PROJECT_DIR, /memory,
  /init, /compact, /permissions, /hooks, /doctor, plan mode, hooks, PreToolUse, PostToolUse,
  bypassPermissions, sandbox, subagent, .claude/agents, worktree, SKILL.md, slash command,
  $ARGUMENTS, MCP, .mcp.json, headless, claude -p, verification loop.
---

# Claude Code — Operating Discipline & Harness Engineering

> **Version**: v2607.1.0 (2026-07-29) — P3 (scope) + this skill's first floor & ledger.
> **Scope**: how to *operate and configure Claude Code itself* well — CLAUDE.md/memory
> discipline, the verification loop, hooks, permissions/settings, MCP, Skills/commands,
> subagents/parallelism, plan-mode & context workflow. Host-agnostic.
> **Out of scope**: the Anthropic *API/SDK* (→ `claude-api` skill); `claude -p` as a subprocess
> driven by Codex (→ Codex-only `driving-claude`); mechanical settings.json
> edits the harness performs for you (→ `update-config` skill); writing domain skills like
> Julia (→ that skill). This skill is the *strategy* layer; those are the *mechanics*.
> The CRAFT of skill content — what deserves a skill, distillation, sibling cuts, trigger test
> sets, adversarial proof — → the `forging-skills` skill; this skill owns the harness contract.
> **Lineage**: distilled from a 172-tip survey (Zenn "5万スターのClaude Code Tips集、本質は2つ
> だけ" → `shanraisshan/claude-code-best-practice` → `code.claude.com/docs` +
> `anthropic.com/engineering`). Version-pinned facts (e.g. "v2.1.83+") were current in 2026-06;
> re-verify against the docs if a feature seems to have moved.

```bash
for f in memory hooks settings-permissions-mcp commands-and-skills subagents-and-parallelism \
  workflow-and-context headless-and-ci methodologies; do
  test -f references/$f.md || echo MISSING references/$f.md; done
test -f scripts/scope-check.ts || echo MISSING scope-check.ts
test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

The whole field of "Claude Code tips" collapses to **two principles**. Everything else is a
recipe. **Read §0–§3 inline first** — they set precedence — then open the one reference that
matches the task.

---

## §0. The two principles (the spine)

**P1 — CLAUDE.md is a *context budget*, not a config dump.** It is loaded **in full every
session** and is **advisory** (injected as a user message; no compliance guarantee). Bloat makes
Claude *ignore the rules that matter*. Keep it lean; lazy-load the rest.

**P2 — Engineer the harness: give Claude a *check it can run*, and put *enforcement* where it is
deterministic.** CLAUDE.md *shapes* behavior but cannot *guarantee* it. The harness — permissions,
hooks, the verify loop — makes things actually happen. The most-repeated rule across all sources:
**Claude stops when work *looks* done; without a check it can run, *you* become the verification
loop.** Hand it a machine-readable pass/fail and demand evidence, not assertion.

**P3 — Every rule has TWO coordinates: which *mechanism*, and which *scope*.** The reflex below
answers only the first. Register a rule at the **narrowest level that covers what it names**.
A rule naming one repo belongs in that repo's `.claude/`. Putting it in `~/.claude/` behind a
`cwd.startsWith(...)` check is **not scoping** — it is a global rule with an early return. It still
spawns on every event in every project. Its failures still reach unrelated sessions. And a
machine-absolute path still lands in a config you share across machines.

> A fast implementation of the wrong thing is still wrong; **unverified work is unfinished.**
> Anthropic's own "effective harnesses" research found a plain loop (progress file + git history +
> one feature at a time + self-verify) beats elaborate multi-agent pipelines — the discipline the
> community frameworks sell is largely **built into the base tool**.

### The decision reflex — when something is wrong, fix it in the right place

| You want… | Put it here | Why |
|---|---|---|
| A behavioral nudge ("prefer X", "explain before editing") | **CLAUDE.md** (or a Skill) | advisory, cheap to state |
| Knowledge needed only for *some* files | **path-scoped `.claude/rules/*.md`** (`paths:` glob) | defers tokens until a matching file is read |
| A reusable procedure / domain expertise | **a Skill** (`SKILL.md`) | progressive disclosure; body loads only on invoke |
| Something that **must happen every time** (format, log, guard) | **a hook** | deterministic; CLAUDE.md *cannot* enforce |
| A hard allow/deny of a tool or path | **`settings.json` permissions** | enforced regardless of the model |
| Proof that it worked | **a check Claude runs** (tests/build/lint/screenshot) | closes the loop so Claude iterates alone |

### …then the scope — the second coordinate (P3)

| The rule names… | Register it in | It then runs in |
|---|---|---|
| **one repo** — its paths, its canon, its policy | that repo's `.claude/settings.json`; hooks under `${CLAUDE_PROJECT_DIR}/.claude/hooks/` | that repo only |
| how **you** work in every repo | `~/.claude/settings.json` | every session on the machine |
| a secret, or a path only **this machine** has | `.claude/settings.local.json` (gitignored) | you, uncommitted |
| org policy nobody may override | managed settings (MDM) | everyone, unoverridably |

**Never hardcode an absolute project path in a user-scope file.** On another machine it is a path
that does not exist. In another repo it is a process spawned to return 0. `scripts/scope-check.ts`
is the deterministic floor here — run it before shipping any `~/.claude` change. Full precedence
table: `references/settings-permissions-mcp.md`.

### Match tool weight to task size (default to vanilla)

| Task | Approach |
|---|---|
| You could describe the diff in one sentence | Just prompt — **skip plan mode** |
| Multi-file / uncertain / risky | **Plan mode** (`Shift+Tab`) — or interview → write `SPEC.md` → execute in a *fresh* session |
| Large, multi-contributor, long-lived | *Consider* Spec-Kit/BMAD — but the bar is high; vanilla usually wins (→ `references/methodologies.md`) |

---

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/memory.md` | CLAUDE.md load order & precedence, `@import` (and why it doesn't save context), path-scoped `.claude/rules/*.md`, `/memory`, auto-memory `MEMORY.md`, `/compact` survival, monorepo `claudeMdExcludes` | writing/auditing any memory file, or "why isn't my rule followed?" |
| `references/hooks.md` | full hook schema, every event, matcher semantics, the exit-code/JSON contract, and recipes (auto-format, protect-paths, command log, re-inject-after-compact, desktop notify) | writing or debugging any hook |
| `references/settings-permissions-mcp.md` | settings.json 5-level precedence, permission rule syntax (`Bash(...)`, Read/Edit anchors, URL filtering), the six permission modes incl. **auto**, `attribution`, and MCP setup/trust | editing settings, designing permissions, or adding an MCP server |
| `references/commands-and-skills.md` | commands⇄Skills unification, `SKILL.md` frontmatter & progressive disclosure, invocation control (`disable-model-invocation`, `context: fork`), `$ARGUMENTS`/`!cmd`, **and** writing good tool/MCP descriptions | authoring a slash command, Skill, or tool/MCP description |
| `references/subagents-and-parallelism.md` | subagents (fresh isolated context) vs `/fork` (inherits), `.claude/agents/*.md`, built-in agents, writer/reviewer & TDD splits, worktrees, agent teams, `/workflows`, headless fan-out | delegating, isolating a big search, or running work in parallel |
| `references/workflow-and-context.md` | Explore→Plan→Code→Commit, plan mode, `opusplan`, `/effort` & `ultrathink`, `/clear`/`/compact`/`/btw`, `/rewind` checkpoints, `/context`/`/usage`, prompt specificity, SPEC.md flow | running a session well or managing the context window |
| `references/headless-and-ci.md` | output styles, `statusLine`, CI/GitHub Actions; Codex-driven `claude -p` subprocess execution routes to `driving-claude` | automating, scripting, or wiring CI |
| `references/methodologies.md` | the vanilla-vs-framework decision ladder; Superpowers / Spec-Kit / BMAD — what to steal, what to skip | tempted by a heavyweight workflow framework |

---

## §1. CLAUDE.md discipline

**Target under 200 lines per `CLAUDE.md`** — the *only* official figure (`code.claude.com/docs/memory`,
"reduce adherence"). It is loaded **in full** every session; the 200 lines is a guideline, not a
truncation point (the hard 200-line/25 KB load cap belongs to auto-memory `MEMORY.md`, not
CLAUDE.md). "60 lines" is **HumanLayer's house style, not Anthropic's** — don't cite it as official.

**Litmus, per line:** *"Would removing this cause Claude to make mistakes?"* If no, cut it.

| INCLUDE | EXCLUDE |
|---|---|
| Non-guessable bash/test/build commands | Anything inferable from the code |
| Code-style rules that **differ from defaults** | Standard language/framework conventions |
| Repo etiquette (branch/PR conventions) | Detailed API docs (**link** instead) |
| Architecture decisions, env quirks, non-obvious gotchas | Frequently-changing info; file-by-file descriptions |
| Specific, verifiable rules ("Run `npm test` before committing") | Self-evident advice ("write clean code") |

- **Bootstrap** with `/init` (set `CLAUDE_CODE_NEW_INIT=1` for the interactive multi-phase flow); it
  folds in existing `AGENTS.md`/`.cursorrules`. **Check `CLAUDE.md` into git.**
- **Bridge `AGENTS.md` without duplication:** make CLAUDE.md's first line `@AGENTS.md`, or
  `ln -s AGENTS.md CLAUDE.md`.
- **Don't config-as-prose.** Permissions / blocked paths / attribution → `settings.json`.
  Formatting-that-must-happen → a **PostToolUse hook** (there is *no* settings.json `formatting`
  key). Must-happen-every-time actions → hooks. CLAUDE.md is advisory and **cannot enforce**.
- **`@path` imports do NOT save context** — imported files expand at launch (max 4 hops). To
  actually *defer* tokens use path-scoped `.claude/rules/*.md` (`paths:` glob) or Skills.
- **Reasoning depth:** use `ultrathink` for a one-off deep think. The old `think`/`think hard`/
  `think harder` ladder is **dead** (passed through as plain text); set session depth with
  `/effort` (`low`/`medium`/`high`/`xhigh`/`max`).

→ Load order, path-scoped rules, auto-memory, `/compact` survival, monorepo: `references/memory.md`.

---

## §2. The verification loop — close it so Claude iterates without you

Give Claude a **machine-readable pass/fail it reads *in-conversation*** — test suite, build exit
code, linter, fixture diff, or a browser/computer-use screenshot vs the design. Then **demand
evidence** (command + output, test result, screenshot), never a bare "done."

- **Bake the criterion into the prompt:** *"write `validateEmail`; cases:
  `user@example.com`→true, `invalid`→false; run the tests after implementing."*
- **For bugs:** *"write a failing test that reproduces it, then fix the root cause — don't suppress
  the error."*
- **UI work:** paste the mock → *"implement, screenshot the result, compare to the original, list
  the diffs and fix them."* The screenshot is the pass/fail signal.

**Escalating stop gates** (reach for the lightest that holds):

1. Ask it to run the check **and iterate** in one prompt.
2. `/goal '<condition>'` — re-checked every turn by a fast model. *Caveat:* it judges only what's
   surfaced in the transcript; it **cannot run commands itself**.
3. A **Stop hook** that exits 2 until a script passes — force-ended after 8 consecutive blocks, so
   check `stop_hook_active` and exit 0 when true (→ `references/hooks.md`).
4. A **fresh-context review subagent** (sees only the diff + criteria; → `references/subagents-and-parallelism.md`).

> Anthropic's rule, verbatim: **"If you can't verify it, don't ship it."**

---

## §3. Hooks essentials — deterministic enforcement

A hook **guarantees** an action at a lifecycle point; use it for "must happen every time, zero
exceptions." Canonical auto-format (note: **PostToolUse runs *after* the tool — it formats
post-hoc, it cannot block or undo**):

```json
{ "hooks": { "PostToolUse": [ {
  "matcher": "Edit|Write",
  "hooks": [ { "type": "command",
    "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write" } ]
} ] } }
```

- **Exit-code contract:** `0` = allow (stdout may *add context* on `UserPromptSubmit`/`SessionStart`);
  `2` = **BLOCK**, stderr fed back to Claude; any other code = non-blocking error. **Never mix exit
  2 with JSON** — the JSON is ignored on exit 2. Use *exit 2 + stderr* **or** *exit 0 + JSON*.
- **PreToolUse decisions** live under `hookSpecificOutput.permissionDecision`
  (`allow`/`deny`/`ask`/`defer`), **not** a top-level `decision`. `Stop`/`PostToolUse` use top-level
  `"decision": "block"`.
- **Hooks can TIGHTEN but never LOOSEN permissions** — a deny hook blocks even under
  `bypassPermissions`; an allow hook never overrides a settings `deny`.
- **Security:** hooks run arbitrary shell with **your full permissions**. Use absolute or
  `${CLAUDE_PROJECT_DIR}` paths, quote variables, keep auto-approve matchers narrow, and gate any
  `~/.zshrc`/`~/.bashrc` echo behind `if [[ $- == *i* ]]` so it doesn't corrupt shell-form hook
  stdout/JSON. Kill all hooks with `"disableAllHooks": true`.

→ Every event, matcher rules, and the recipe book: `references/hooks.md`.

### Recipe — cure a *generation* pathology (code-switching) in layers, don't gate it

Code-switching (an LLM leaking English into Japanese prose — `commitする`, `deliverable である`)
is **Language Confusion**, a named generation-time pathology (Marchisio et al., EMNLP 2024): English-
centric weights pull toward English under load, worse with complex prompts + high temperature. The
root cause is in the weights — you cannot fix it, and **a hook cannot cure generation** (the
legit-vs-gratuitous line is semantic; a blanket latin gate is register-relative and false-positives
on real domain terms). So SHAPE generation and CATCH only the deterministic residue, across layers:

1. **Behavior (the primary lever)** — a negative-framed language-lock in CLAUDE.md / an output-style:
   *「思考から最終出力まで一言語で統一。英語動詞を する に接がない(コミットする, not commitする)。専門語はカタカナか日本語で。」* Negative constraints bind harder than "please write in Japanese"; a few-shot example of the fixed form helps most (the paper's finding).
2. **Context** — your own prompt's English licenses the model to mix; feed cleaner input.
3. **Feedback** — detection is `linting-prose` (`codemix-flag.py` + prh, at *deliverable* time, not
   every turn). The one always-wrong class (latin verb + する) is gated by the Stop hook
   `agents/claude/hooks/detect-prose-correo.ts` (narrow, code/quote-stripped, exit 2 → forces a rewrite).
4. **Operation** — long context drifts toward English; refresh/summarize in the target language.

Register-relative: internal engineering chat legitimately mixes; the guard is for external/deliverable
prose (`linting-prose` hygiene corollary). This is the model for any generation pathology: shape at
the source, gate only the residue that is deterministically always-wrong.

---

## §4. Anti-patterns (do **not**)

- **`--dangerously-skip-permissions` / `bypassPermissions`** outside an isolated container/VM. Use
  **`auto` mode** (classifier-gated) instead; lock the flag out org-wide via
  `permissions.disableBypassPermissionsMode: "disable"`.
- **Config-as-prose** — asking in CLAUDE.md for what `settings.json`/hooks should *enforce*.
- **Project policy at user scope** (P3) — a hook or permission that names ONE repo, registered in
  `~/.claude/settings.json` and gated by a `cwd` check. The gate hides nothing. The process still
  spawns on every matching event in every project; a bug in it reaches unrelated sessions; the
  absolute path is dead weight elsewhere. Move it to that repo's `.claude/`, where the cwd check
  then **deletes itself** — the rule is only loaded where it applies.
- **Bloated CLAUDE.md** — over ~200 lines reduces adherence; never include inferable-from-code
  content or self-evident advice.
- **`@path` imports "to save context"** — they expand at launch; use rules/Skills to defer.
- **Kitchen-sink sessions** (unrelated tasks in one context) → `/clear` between tasks.
- **Correcting in a polluted context** — after **2 failed corrections**, `/clear` and rewrite a
  sharper prompt with what you learned. A clean session beats a long degraded one.
- **Unscoped exploration** ("investigate" → reads hundreds of files) → scope it, or delegate to a
  subagent to protect the main context.
- **Loose Bash permission rules around runners** — `Bash(npx *)`, `Bash(devbox run *)` aren't
  argument-stripped and allow arbitrary subcommands; scope them: `Bash(devbox run npm test)`.
- **Trusting hype** — "174k stars", "10×", "STOP everything" framings are uncorroborated; and a
  Skill is **not** guaranteed to auto-trigger (description-matched, ~1% context budget) — **verify
  invocation yourself.**
- **Heavyweight frameworks on small/solo tasks** (BMAD, Spec-Kit, 21-agent orchestration).
- **Trusting MCP servers** — every server that fetches external content is a **prompt-injection
  boundary**; keep personal-credential servers at *user* scope, never in a committed `.mcp.json`.
- **Config present ≠ server live** — an MCP entry registered in `.mcp.json` AND enabled in
  settings can still produce ZERO tools in-session (server exits before the handshake; e.g. a
  cwd-gated stdio server spawned in the wrong directory). Diagnose with `claude mcp list` +
  the per-server client log, never by re-reading the config; a tool-specific `driving-*` skill
  (driving-cocoindex, driving-codex) supplies the expected surface + fallback AFTER liveness
  is settled here.

---

## §5. Setup / audit checklist

When setting up or auditing a project's Claude Code config, in order:

1. **CLAUDE.md** under 200 lines, passes the litmus, no config-as-prose? (§1)
2. **A runnable check exists** and is named in the prompt/CLAUDE.md (test/build/lint/screenshot)? (§2)
3. **Mechanical concerns enforced** — formatting & guards in hooks, allow/deny & attribution in
   `settings.json`, not prose? (§3, `references/settings-permissions-mcp.md`)
4. **Permissions** least-privilege, no `bypassPermissions` default, runners scoped? (§4)
5. **Conditional/large knowledge** lazy-loaded via `.claude/rules/*.md` or Skills, not CLAUDE.md? (§1)
6. **MCP servers** scoped correctly, personal creds not committed? (§4)
7. **`CLAUDE.md`, `.claude/settings.json`, `.claude/rules/`, `.claude/commands/`, `.claude/skills/`,
   `.claude/agents/` checked into git**; `.claude/settings.local.json` and `.claude/worktrees/`
   gitignored?

Then audit the OTHER scope — the one a project-shaped checklist cannot see (P3):

8. **`~/.claude/` carries nothing that names a single repo?** Run `bun scripts/scope-check.ts`; it
   greps user-scope hooks and settings for absolute project paths. Every hit belongs in that repo's
   `.claude/`. Then budget the survivors: each user-scope hook costs a process on **every** matching
   event in **every** project. A hook with no owner and no retirement condition is a permanent
   tax — retire it or move it down.
