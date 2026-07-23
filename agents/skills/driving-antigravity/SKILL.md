---
name: driving-antigravity
description: >-
  Drives the Antigravity CLI (agy) as a headless worker — Google's official successor to the
  deprecated gemini-cli — via `agy -p` in Bash, an Agent subagent, or a Workflow sonnet wrapper.
  Edge: a MULTI-VENDOR roster (Gemini 3.x + Claude 4.6 + GPT-OSS) on ONE Google subscription
  (one sub, N vendors). Use when embedding agy in a pipeline (sonnet draft→agy audit; same
  prompt to Gemini+Claude+GPT-OSS, 不一致=signal), probing served models (agy models), choosing
  --model, parsing agy output, or unsticking a hung/misbehaving agy call. Triggers: agy,
  Antigravity CLI, antigravity, agy を workflow に組み込む, agy で監査, Claude 4.6 を agy 経由で,
  マルチベンダー検証, agy のモデル一覧, agy がファイルを勝手に書いた, agy -p が返らない. LAW:
  NO-METER — agy exposes ZERO per-call token/cost (never fabricate one; count calls, can't measure
  spend); UNCONFINED — default -p auto-approves file writes, no confinement, cwd≠boundary;
  CATALOG-BY-PROBE — --model wants the EXACT `agy models` display string; VERSION-DRIFTS — agy
  self-updates out-of-band from brew. Cuts: codex subprocess (metered, sandboxed, single-vendor) →
  driving-codex; claude harness (hooks/Workflow/subagents) → operating-the-harness; Anthropic
  API/Claude pricing → claude-api (agy→Claude is still driving agy → here); prompt wording →
  prompting-llms. gemini-cli は deprecated → agy のみ駆動. Workflow-native: model/containment/prompt
  + cross-model adjudication stay SOLO; parallel agy calls fan out one sonnet wrapper each. English
  skill; respond in the user's language (default Japanese).
---

# Driving Antigravity — the agy CLI as a headless worker

> **Version**: v2607.1.2 (2026-07-15 — .2: +reciprocal cuts to driving-grok (Routing + MUST-NOT-FIRE)
> when the xAI-grok sibling was forged; 2026-07-14 — .1: initial forge, hardened after an adversarial verify fleet
> (Terra/codex + agy self-dogfood + sonnet refuters) flagged shell-injection, false containment,
> and a too-low version floor)
> **Scope**: embedding `agy` (Antigravity CLI) as a headless worker under Claude Code. The
> `claude` harness itself → `operating-the-harness`; the `codex` subprocess → `driving-codex`.
> **Maturity**: EARLY — a first-principles port of the proven `driving-codex` subprocess pattern to
> a ~9-week-old target (agy created 2026-05-13). This does NOT codify a settled community practice
> (none exists yet); the popular community bridges (`gemini-mcp-tool`, ~2.3k★) wrap the SAME
> `agy -p` subprocess this skill drives directly — ergonomics, no capability gain (see Alternatives).
> **Durability contract**: no fast-moving fact is a load-bearing ASSERTION in this body — the dated
> `references/model-catalog.md` owns the roster, exact display strings, versions, and quota. Code
> examples use PLACEHOLDERS for model strings (resolve live via `agy models`); any inline fact
> carries an "as of" date.
> **Build order (atomic)**: `test -f references/model-catalog.md && test -x scripts/probe-models.sh
> && test -f tests/forge-verification-ledger.md && echo OK || echo INCOMPLETE`

## Language

Stable tokens even inside Japanese prose: **NO-METER**, **UNCONFINED**, **CATALOG-BY-PROBE**,
**VERSION-DRIFTS**, **MULTI-VENDOR**, **wrapper**, **probe**, **fire / no-fire**.

## THE LAW

> agy is a SUBPROCESS gateway, not an agent type — embed via `agy -p` (main-loop Bash or a sonnet
> Workflow worker); the return is exit code + stdout. Its edge is MULTI-VENDOR models on one
> subscription; its price is two absences you must design around:
> - **NO-METER**: agy exposes ZERO per-call token/cost ANYWHERE — no stdout line (unlike codex's
>   `tokens used`), no JSON mode (unlike gemini-cli's `-o json`), no local DB field, no ccusage
>   support. You CANNOT measure spend after the fact. Cap by CALL COUNT as a **circuit-breaker,
>   NOT a spend budget** (prompt length, tool use, and model weight all vary — the catalog records
>   Claude/Opus drawing far more per call than Gemini). NEVER fabricate a token number in a relay —
>   "usage: UNAVAILABLE" is the honest value.
> - **UNCONFINED**: default `-p` auto-approves EVERY tool call including file writes — no prompt,
>   no hang, and **a cwd is NOT a security boundary**: agy writes under `$HOME` (`~/.gemini/…`)
>   regardless of cwd (observed writing to `~/.gemini/antigravity-cli/scratch/` while cwd was
>   elsewhere — n=1, treat as a lower bound on risk, not a full map). There is no proven cheap
>   `--sandbox read-only` equivalent. Containment is the CALLER's job (see A3), and a git worktree
>   is NOT sufficient for untrusted input.
>   **[CONTESTED as of v1.1.5, 2026-07-23]** the `agy changelog` claims headless `-p` now honors
>   `settings.json` permissions/sandbox/file-access and soft-denies confirm-required tools (fixes in
>   1.1.3 + 1.1.5) — if true this materially softens UNCONFINED. The write-outside-cwd evidence
>   predates it (v1.1.2). Treat the LAW as still binding, but re-probe the live binary before relying
>   on either it or the new claim (catalog → VERSION-DRIFT 2026-07-23).
> Availability is CATALOG-BY-PROBE; both the roster AND the binary version DRIFT (agy self-updates
> out-of-band from Homebrew — the live binary rewrote itself mid-audit). **Pin a floor: require
> `agy --version` ≥ 1.1.2** (1.1.1 fixed a swallowed server error — commonly quota /
> RESOURCE_EXHAUSTED — returning exit-0 + EMPTY stdout on the non-TTY stdout Claude Code's Bash
> tool always gives, antigravity-cli#76; 1.1.2 also made an unresolved `--model` fail loudly
> instead of silently downgrading). On ANY empty stdout, re-probe and read the transcript before
> trusting "empty."

## Gates

| Gate | Rule | Artifact |
|---|---|---|
| **A1 PROBE** | Verify `agy --version` ≥ 1.1.2 FIRST. Then `agy models` (free, local, no quota) → copy the EXACT display string → a trivial `agy -p` probe; cite RC + the string. On ≥ 1.1.2 an invalid `--model` is a FREE client-side fast-fail (RC=1, ~4s, prints the valid list) — candidate-probing costs NO quota (below 1.1.2 it silently downgrades instead → probes lie). | `scripts/probe-models.sh` output + the version + where the string came from |
| **A2 RECIPE** | Every embedded call passes explicit `--model "<exact display string>"`, wraps in shell `timeout N`, redirects `</dev/null`, reads `rc=$?` on the NEXT line (never `$?` after a pipe). Shell `timeout` bounds the PARENT's wait only — it does NOT reap agy's tool/background children (catalog records an unreaped-process incident); kill the process group if a call spawns work. A bare `agy -p` inherits the config-default model AND auto-approves tools. | the flag set greppable in the call |
| **A3 CONTAINMENT** | agy is UNCONFINED and a cwd is NOT a security boundary — it writes under `$HOME` regardless of cwd. **TEXT-RETURN** (prompt requests NO mutation) is the default mode — but agy MAY still use tools, so run with NO secrets you'd mind exposed in the env. **FILE-MUTATING or untrusted input** → a disposable identity: a git worktree limits blast radius for *repo* files only (NOT `$HOME`/creds); real isolation needs a container/VM with read-only inputs and no secrets. Never point agy at a repo you care about, or a shell with live credentials, on untrusted input. | a TEXT-RETURN (no-tool) prompt, OR a container/disposable-identity run — a bare worktree is NOT sufficient for untrusted input |
| **A4 RELAY** | A worker that ran agy relays a BOUNDED, delimited record: exit code + the stdout answer (large → store as an artifact and relay a reference) + the literal `usage: UNAVAILABLE (agy exposes no per-call metering)`. Never fabricate a token count (NO-METER); never blindly reinsert unbounded model text into an orchestrator prompt (injection + context-exhaustion). | the delimited triple in the worker's return |
| **A5 SELECT** | NO-METER makes token head-to-heads impossible; call count is a circuit-breaker, not a spend budget. Promote a model to a standing role by WALL-TIME + accepted-work quality + (interactive-only) `agy -i` → `/usage` quota-drain observation — NEVER a token count. | the comparison (wall time + quality verdict + quota note) |

## The invocation recipe — LOW freedom

Step 0 (A1): verify the version floor and resolve the EXACT display string, via the probe script —
never hand-roll a probe:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/probe-models.sh              # no args → version + roster
bash ${CLAUDE_SKILL_DIR}/scripts/probe-models.sh "<display string>"   # ping one model
```

Then the call (payload comes from a variable/file — see the INJECTION RULE below, never inlined):

```bash
agy --version   # must be ≥ 1.1.2 (else empty stdout may be a swallowed error — A1)
timeout 300 agy \
  --model "<exact string from `agy models`>" \
  -p "$PROMPT" </dev/null
rc=$?   # read on the NEXT line — never $? after a pipe
```

- `--model`: the EXACT string `agy models` prints on the LIVE binary, shell-quoted. Its FORM drifts
  by version (catalog owns the snapshot): parenthesized display strings on v1.1.2 (`Gemini 3.5 Flash
  (Medium)`), stable dash-case slugs as of v1.1.5 (`gemini-3.6-flash-medium`) — never carry a form
  across a version bump. Invalid → free RC=1 + the valid list (on ≥ 1.1.2).
- **stdin is IGNORED in `-p` mode** (v1.1.1+ deliberately stopped reading it) — put ALL context in
  `$PROMPT`; piping `echo ctx | agy -p ...` silently drops ctx. Keep `</dev/null`: agy still checks
  stdin for TTY/EOF status, so the redirect prevents a status-check HANG (antigravity-cli#76) — a
  permanent defensive habit, not a content pipe.
- **Auth**: agy rides the user's existing Antigravity/Google login (no API key, unlike gemini-cli);
  headless reuses the cached credential. A machine with no prior interactive login will FAIL — do a
  one-time interactive `agy` login first. (Details/date → `references/model-catalog.md`.)
- **Output**: stdout = the bare answer (clean — no ANSI, no spinner; stderr empty on success).
  There is NO token/usage line anywhere (NO-METER). Empty stdout + rc=0 on < 1.1.2 = a swallowed
  error, NOT a real empty answer (A1).
- `timeout`: agy has `--print-timeout` (default 5m0s); ALSO wrap in shell `timeout` for a hard
  ceiling — but see A2: it does not reap children.
- Capture form for exit code: `out=$(agy … </dev/null); rc=$?` — never `agy … | tail` then `$?`.

### Gotchas — each row is an observed failure (2026-07-14; exact strings live in `references/model-catalog.md`)

| Symptom | Cause | Fix |
|---|---|---|
| no usage/cost anywhere; `agy models --json` → `flags provided but not defined: -json` (RC=1) | agy has NO structured-output/metering mode | accept stdout as the answer; usage is UNAVAILABLE (NO-METER) — do not invent one |
| model silently wrong, or RC=1 + a printed model list | `--model` string is not an EXACT `agy models` string (silent downgrade below 1.1.2) | require ≥ 1.1.2; copy the LIVE `agy models` string verbatim — its form drifts by version (dash-case slugs as of v1.1.5, parenthesized names on v1.1.2) |
| model answers as if it never saw your piped context | stdin is dropped in `-p` mode | put the context INSIDE the `-p` argument |
| agy wrote a file you did not expect, incl. outside cwd (under `$HOME`) | default `-p` auto-approves tools; cwd is NOT a write boundary | A3: TEXT-RETURN prompt for audits; container/disposable identity for untrusted or FILE-MUTATING work |
| `agy --version` today ≠ yesterday; brew cask version ≠ live binary | agy self-updates out-of-band from Homebrew | `agy --version` + `agy changelog` before any load-bearing version fact |
| RC=0 but EMPTY stdout | on agy < 1.1.2 a swallowed server error (often quota) → exit-0 + empty output on non-TTY stdout — Claude Code's Bash-tool case (antigravity-cli#76) | require `agy --version` ≥ 1.1.2; treat empty stdout as SUSPECT — re-probe + read `transcript.jsonl`, never as a confirmed empty answer |
| exit code reads 0 after a failed run | `agy … \| tail` then `$?` returns the pipe's rc | capture `out=$(agy …); rc=$?` |

## Output contract — agy has exactly ONE

| Need | How | Reality |
|---|---|---|
| the answer | capture stdout | clean bare text + trailing newline; strip it |
| per-call usage | — | **UNAVAILABLE locally** (no line, no JSON, no DB, no ccusage). NO-METER |
| quota remaining | `agy -i` → `/usage` or `/quota` | INTERACTIVE ONLY; live-fetched per session, cached to no parseable file |
| audit trail / empty-stdout recovery | a per-conversation `transcript.jsonl` under `~/.gemini/antigravity-cli/` (exact path + provenance → catalog) | parseable role/content/timestamp — for TRANSCRIPT, not usage. Also the community ESCAPE HATCH when stdout is empty (what `gemini-mcp-tool` + agy MCP wrappers read as fallback) |
| multi-turn chaining | `-c`/`--continue` (most recent), `--conversation <id>` | each bare `-p` starts a NEW conversation |

Cost-model facts, roster snapshot, exact paths, and provenance grades → `references/model-catalog.md`.

## Embedding in Workflow scripts — the sonnet-wrapper pattern

`agent()` cannot BE agy; a worker RUNS it. Every `agent()` passes `{model: 'sonnet'}` — the
user-global PreToolUse hook denies the Workflow otherwise (policy owned by `~/.claude/CLAUDE.md`).
The worker embeds the recipe verbatim + the A4 RELAY demand, so the orchestrator gets observables.

> **INJECTION RULE (mandatory).** The prompt payload is UNTRUSTED text. NEVER interpolate task text
> into the shell command — `-p '...${task}...'` is a shell-injection + quote-break bug. The worker
> writes the payload to a scratch file with its file tools, then reads it back as ONE argument:
> `-p "$(cat "$PROMPT_FILE")"`. Only TRUSTED config (a model display string from our own roster) may
> be interpolated.

```js
const agyAudit = (target) => agent(
  `You drive the Antigravity CLI (follow the driving-antigravity recipe).
   1. Verify \`agy --version\` ≥ 1.1.2 (else STOP — empty stdout may be a swallowed error).
   2. Write the audit prompt for ${JSON.stringify(target)} to a scratch file with your file tools
      (NEVER interpolate it into the shell). Then run exactly:
        timeout 300 agy --model "<a Claude display string from \`agy models\`>" \
          -p "$(cat "$PROMPT_FILE")" </dev/null
        rc=$?
   3. A4 RELAY: return exit code + the FULL stdout + the literal
      "usage: UNAVAILABLE (agy exposes no per-call metering)". Empty stdout with rc=0 → report the
      #76 landmine + the agy version; do NOT call it a real answer.`,
  {model: 'sonnet', phase: 'Audit', label: `agy:${target}`})
```

- **MULTI-VENDOR panel** — the house killer app: fan the SAME question to N vendor models from ONE
  binary; cross-vendor DISAGREEMENT is the signal (agreement is not proof). Same injection rule —
  payload via file, only the trusted model string is interpolated:

```js
const models = [/* exact display strings from `agy models` — see references/model-catalog.md */];
const panel = await parallel(models.map(m => () => agent(
  `Drive agy: verify \`agy --version\` ≥ 1.1.2; write the question to a scratch file (file tools,
   NOT shell); then: timeout 300 agy --model ${JSON.stringify(m)} -p "$(cat "$QFILE")" </dev/null ;
   rc=$? . A4 RELAY the delimited triple.`,
  {model: 'sonnet', phase: 'Panel', label: `agy:${m}`})));
// adjudicate SOLO: agreement is weak evidence; any single dissent is the first thread to pull.
```

- **Parallel agy calls**: no lock observed at N=2 (probe-verified) — treat higher fan-out as
  unproven for rate/quota contention; re-probe before large panels.
- **Nesting**: `workflow()` nests one level only; the agy call adds none (it is Bash).
- **Selection (A5)**: NO-METER kills the token axis — promote by wall-time + accepted quality +
  interactive `/usage` quota drain, never a token count.

## Execution model — the modal invocation is SOLO

| Step | Mode | Why |
|---|---|---|
| choose model / containment class / prompt | SOLO | judgment spine — quota-blind cost, unconfined risk, and task sit in one context |
| a single agy call | SOLO (main-loop Bash) | spawn overhead exceeds the work |
| parallel agy calls / a multi-vendor panel | FAN-OUT — one sonnet wrapper per call | calls are independent; workers relay observables |
| availability probe | SOLO script | never spawn an agent to run a script |
| cross-model disagreement adjudication | SOLO | the verdict braids every arm's evidence |

## MUST-NOT-FIRE — and the fire/no-fire set

FIRES:

| Ask | Why |
|---|---|
| 「agy を workflow に組み込みたい」 | core territory |
| 「Antigravity CLI で監査させて」 | core territory |
| 「Claude 4.6 / Gemini 3 を agy 経由で投げて」 | MULTI-VENDOR routing through agy |
| 「agy でマルチベンダー検証」 | panel pattern |
| "agy -p hangs / returned nothing" | gotchas table |
| 「agy が勝手にファイルを書いた」 | UNCONFINED |
| 「agy の使えるモデル一覧」 | CATALOG-BY-PROBE |
| "have sonnet drive agy in a draft→audit panel" | wrapper pattern |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| the `codex` subprocess | `driving-codex` |
| GPT review — OpenAI's GPT via codex vs open-weight GPT-OSS via agy | OpenAI GPT (`codex exec`) → `driving-codex`; GPT-OSS through agy's Google-subscription roster → here |
| `pipeline()`/`parallel()`/hook/subagent-policy mechanics of the CLAUDE harness | `operating-the-harness` |
| "which Claude model + Anthropic pricing / API" | `claude-api` — it owns Claude model facts & the Anthropic API and may co-fire on any "Claude" mention; no exclusivity claimed here. Runtime cut: asking about the API/pricing → claude-api; DRIVING the agy binary that routes to a Claude model → here |
| 「プロンプトを改善して」 | `prompting-llms` |
| the `grok`/Grok Build subprocess (xAI, METERED, EXFIL-RISK) or the `codex` subprocess (OpenAI GPT) | `driving-grok` / `driving-codex` — decide by which binary you invoke |
| "what is Antigravity?" | trivial — no skill |
| anything about gemini-cli | it is DEPRECATED (consumer OAuth dead 2026-06-18; brew-disable slated ~2026-12 [third-party, catalog]) — this skill NOTES that and drives agy instead; no gemini skill exists or should fire |

## Alternatives — MCP wrappers wrap the SAME subprocess (no capability gain)

Community bridges exist but reduce to this skill's own mechanism — MCP is a discovery/ergonomics
skin over the identical `agy -p` call, not a different path to the model:
- `gemini-mcp-tool` (~2.3k★, actively maintained) shells out to `agy -p`/`gemini -p` and reads
  stdout with a `transcript.jsonl` fallback — the same call this skill makes, plus `/mcp`
  auto-discovery and tool-call framing. Reach for it ONLY if you want that surface; zero capability gain.
- `pal-mcp-server` (ex-`zen-mcp-server`, ~11.7k★) is the biggest name but its agy support sits in
  UNMERGED PRs (last `main` commit 2025-12) — do not recommend it as "the" bridge.
- `claude-code-router` (~35k★) is a DIFFERENT problem — an API-level model-SWAP for Claude Code's
  OWN completions, not delegation to agy's agent loop. Never cite it for/against this pattern.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `driving-codex` | CARDINALITY/PURPOSE — which BINARY + its contract. `codex exec` (HAS per-call metering + a real `--sandbox read-only`, single-vendor GPT) → driving-codex; `agy`/Antigravity (NO-METER, UNCONFINED, MULTI-VENDOR Gemini/Claude/GPT-OSS) → here. Both embed a headless CLI as a worker; decide by which binary you invoke. |
| `driving-grok` | CARDINALITY/PURPOSE — which BINARY: `grok -p` (xAI Grok Build — METERED, real sandbox, carries an EXFIL-RISK data-leak law) → `driving-grok`; `agy` (Antigravity, NO-METER, UNCONFINED, multi-vendor) → here. |
| `operating-the-harness` | PURPOSE — which binary is being CONFIGURED: the `claude` harness (hooks, settings, Workflow tool semantics, subagent policy) → there; the `agy` subprocess → here. |
| `claude-api` | Anthropic API / Claude model facts + pricing → there (it may co-fire on "Claude" — no exclusivity claimed here). Driving the agy binary that routes to a Claude model, with no API/pricing question → here. |
| `prompting-llms` | prompt WORDING → there; agy CLI mechanics → here. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/model-catalog.md` | DATED snapshot: probe-verified roster + display strings, version floor + self-update history, NO-METER accounting evidence, UNCONFINED write evidence, auth, exact paths, quota tiers (marked UNVERIFIED), provenance grades | any model-name, availability, version, path, or auth question |
| `scripts/probe-models.sh` | deterministic availability probe (floor — NOT semantic): version gate + tri-state AVAILABLE/INVALID_NAME/INCONCLUSIVE | A1 gate — before asserting availability |
| `tests/forge-verification-ledger.md` | forge provenance, probe log, calibration table, verification-fleet results | reforging this skill |
