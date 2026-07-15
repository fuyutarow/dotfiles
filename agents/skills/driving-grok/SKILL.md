---
name: driving-grok
description: >-
  Drives xAI's Grok Build CLI (grok) as a headless worker from Claude Code — Bash, an Agent
  subagent, or a Workflow sonnet wrapper running `grok -p`. The most Claude-Code-like of the
  house's headless coding CLIs (metered, sandboxed, reads CLAUDE.md/hooks/MCP). Use when embedding
  grok in a pipeline (sonnet draft→grok audit; cross-vendor verify,
  不一致=signal), probing served models (grok models), choosing -m / --effort / --output-format json,
  parsing grok usage, or unsticking a hung grok call. Triggers: grok, Grok Build, grok CLI, grok を
  workflow に組み込む, grok で監査, grok のモデル一覧, grok が repo をアップロード, 情報漏洩,
  grok -p が返らない, マルチベンダー検証. LAW: EXFIL-RISK — grok was caught uploading whole
  repos+secrets to xAI (2026-07, server-side-mitigated only) → DATA-MINIMIZE, never a secret-bearing
  repo, --sandbox can't stop it; PLAN-IS-NOT-READONLY — --permission-mode plan doesn't block
  headless writes (use --sandbox read-only); METERED — --output-format json carries full token
  usage; CATALOG-BY-PROBE — models_cache is a snapshot. Cuts: codex (OpenAI GPT) → driving-codex;
  agy (Antigravity/Google, multi-vendor) → driving-antigravity; claude harness →
  operating-the-harness; prompt wording → prompting-llms; NOT the log-parsing grok / Groq (hardware)
  / xai-org/grok-1 / superagent-ai/grok-cli. Workflow-native: model/containment/prompt + cross-model
  adjudication stay SOLO; parallel grok calls fan out one sonnet wrapper each. English skill; respond
  in the user's language (default Japanese).
---

# Driving Grok — the xAI Grok Build CLI as a headless worker

> **Version**: v2607.1.0 (2026-07-15 — initial forge)
> **Scope**: embedding xAI's `grok` (Grok Build) CLI as a headless worker under Claude Code — solo
> Bash calls, Agent-tool subagents, Workflow scripts where every `agent()` is a sonnet wrapper whose
> Bash runs `grok`. The `codex` subprocess → `driving-codex`; the `agy` subprocess →
> `driving-antigravity`; the `claude` harness itself → `operating-the-harness`.
> **Maturity**: EARLY — grok CLI launched 2026-05-25 (~7–8 weeks old); community subprocess-drive
> patterns are thin (the strongest found, zachdunn/grok-plugin-claude-code, 18★, self-describes as
> cloning OpenAI's own codex-plugin-cc). This is a first-principles port of the proven
> `driving-codex` pattern, hardened for grok's verified 2026-07 data-exfiltration incident (THE LAW,
> below) — a risk driving-codex and driving-antigravity do not carry.
> **Durability contract**: this body asserts NO model IDs, token prices, CLI version numbers, or
> exact error strings as FACTS — every fast-moving fact lives in `references/model-catalog.md`
> under its dated header. One declared exemption, dated bait re-verified on reforge: the invocation
> recipe's `-m grok-4.5` is a labeled dated example, mirroring `driving-codex`'s own exemption —
> real work resolves the id live per G1.
> **Build order (atomic)**: `test -f references/model-catalog.md && test -x scripts/probe-models.sh
> && test -f tests/forge-verification-ledger.md && echo OK || echo INCOMPLETE`

## Language

Stable tokens even inside Japanese prose: **METERED**, **CATALOG-BY-PROBE**, **EXFIL-RISK**,
**PLAN-IS-NOT-READONLY**, **DATA-MINIMIZE**, **VERSION-DRIFTS**, **RELAY-VERBATIM**, **wrapper**,
**probe**, **fire / no-fire**.

## What grok IS

grok = xAI's "Grok Build" (https://x.ai/cli), a closed-source terminal coding agent, cask
`grok-build` (binaries `grok` + `agent`). You embed it by running `grok -p` via Bash (main-loop or
a sonnet Workflow worker); the return is exit code + stdout, or a rich JSON envelope. It is the
MOST Claude-Code-like of the house's three drive-* targets — it even reads Claude Code's
CLAUDE.md, hooks, MCP servers, and skills on first launch, and resumes Claude/Codex/Cursor
sessions. Its strengths over the siblings: the richest structured output (`--output-format json`
with full per-call token usage + `modelUsage`; `--json-schema` schema-constrained
`structuredOutput`) and a real OS-level sandbox (Landlock/Seatbelt). Its defining liability: a
**verified 2026-07 data-exfiltration incident** (THE LAW, below) that makes DATA MINIMIZATION, not
sandboxing, the containment law. On this host it lives on R99 (WSL2, `ssh R99-wsl`, binary at
`/home/linuxbrew/.linuxbrew/bin/grok`), authenticated via a grok.com session.

## THE LAW

> grok is a SUBPROCESS coding agent, not an agent type — embed via `grok -p` (main-loop Bash or a
> sonnet Workflow worker); the return is exit code + stdout, or the JSON envelope. Four pillars:
> - **EXFIL-RISK / untrusted-by-default** (the load-bearing one): in 2026-07 a wire-capture proved
>   Grok Build (v0.2.93) uploaded the ENTIRE tracked git repo — full history + committed secrets,
>   unredacted — to an xAI-controlled cloud storage bucket in-process, **even on a trivial,
>   non-mutating prompt**, at roughly 27,800× the task's real data volume, regardless of the
>   `/privacy` toggle (which affects retention only, not transmission). xAI's fix so far is a
>   SERVER-SIDE flag flip (`disable_codebase_upload:true`, 2026-07-13); the upload code reportedly
>   remains in the shipped binary, and no client fix or full public account has been published
>   [third-party, heavily corroborated — The Register, Hacker News front page, Cybernews, wire-level
>   analysis by researcher cereblab]. Consequence you MUST design around: **you cannot `--sandbox`
>   your way out** — the OS sandbox's network restriction blocks child-process egress (seccomp) but
>   NOT the in-process API channel the upload rides (the agent needs network to function, so
>   in-process HTTP is never blocked by any profile). The only real control is DATA-MINIMIZE: never
>   point headless grok at a repo whose history/secrets you can't afford at xAI — run it on a
>   scrubbed/throwaway checkout (no real secrets, no sensitive history), or not at all for sensitive
>   code. R99 runs a post-incident build; treat the client-side capability as still present.
> - **PLAN-IS-NOT-READONLY**: `--permission-mode plan` does NOT block writes in headless `-p`
>   (probe-verified: it created the requested file, RC=0). The name is inherited from Claude Code
>   but not enforced headlessly. Real filesystem containment is `--sandbox read-only`
>   (Landlock ≥5.13 / Seatbelt), applied to the WHOLE process at startup — not the permission mode.
> - **METERED** (the good news, unlike `driving-antigravity`'s agy): `--output-format json` returns
>   full `usage` {input/output/cache_read/reasoning/total tokens} + per-model `modelUsage`. Use it —
>   real spend visibility. Plain `-p` (the default) prints only the answer, no usage line.
> - **CATALOG-BY-PROBE**: `~/.grok/models_cache.json` is a fetched-at delivery snapshot; the default
>   `grok models` roster is a SUBSET of what `-m` can reach. Availability is a probe exit code,
>   never the cache or model memory. Version DRIFTS (near-daily point releases, self-update,
>   closed-source, no public issue tracker) — re-verify before any load-bearing version claim.

## Gates

| Gate | Rule | Artifact |
|---|---|---|
| **G1 PROBE** | Resolve the EXACT model id (`grok models`, free/local, or `references/model-catalog.md`) → run a trivial `grok -p ... --output-format json` probe; cite RC + `usage`. An unknown `--model`/`-m` is a FREE client-side RC=1 fast-fail (checked against `models_cache`, no quota spent). | `scripts/probe-models.sh` output + where the id came from |
| **G2 DATA-MINIMIZE** (deny-gate) | Before any `grok -p` that can read files: confirm the cwd/checkout carries NO secret you can't afford uploaded (EXFIL-RISK). For sensitive work run in a scrubbed/throwaway clone (no real `.env`, no history that matters), OR use a pure TEXT-RETURN prompt from a directory with nothing sensitive. NEVER run headless grok in a production repo with live credentials. | the call runs in a scrubbed/throwaway dir OR a no-file-read prompt; a one-line comment names which |
| **G3 RECIPE** | Every embedded call passes explicit `-m "<model>"`, `--output-format json` (usage + clean parse), wraps in shell `timeout N`, redirects `</dev/null`, reads `rc=$?` on the NEXT line. For any file/tool freedom, pass `--sandbox <profile>` — NOT `--permission-mode plan` (PLAN-IS-NOT-READONLY). Do NOT pass `--always-approve` on untrusted input. | the flag set greppable in the call |
| **G4 RELAY** | A worker that ran grok relays VERBATIM: exit code + the JSON envelope's `text` + the `usage`/`modelUsage` block (METERED — real numbers, never fabricated). Large output → store as an artifact, relay a reference (don't reinject unbounded model text into the orchestrator). | the delimited triple in the worker's return |
| **G5 SELECT** | grok IS metered — promote a model to a standing role by a measured head-to-head on the real task: verdict quality + `usage.total_tokens` + wall time, INCLUDING the house sonnet baseline arm (same as `driving-codex` C4). | the comparison (quality + tokens + wall time) |

## The invocation recipe — LOW freedom

Step 0 (G1): resolve the exact model id and verify auth — never hand-roll a probe, run
`bash ${CLAUDE_SKILL_DIR}/scripts/probe-models.sh` (no args → version + roster; an id → a tri-state
ping). HOST NOTE: on R99, non-login `ssh R99-wsl` lacks linuxbrew on PATH — use the full path
`/home/linuxbrew/.linuxbrew/bin/grok`, or
`ssh R99-wsl 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"; grok ...'`.

```bash
# G2 first: is this dir/checkout safe to expose to xAI? (EXFIL-RISK) If not, clone a scrubbed copy.
timeout 300 grok -p "$PROMPT" \
  -m grok-4.5 \
  --output-format json \
  </dev/null
rc=$?   # read on the NEXT line — never $? after a pipe
```

- `-m`/`--model`: exact model id (`grok models`). Unknown id → free RC=1 client-side fast-fail +
  the valid list; `-m grok-4.5` above is a dated example (G1 resolves it live for real work).
- `--output-format json`: returns `{text, stopReason, sessionId, usage{…}, modelUsage{…},
  structuredOutput?}`. Parse `.text`; read `.usage` for spend (METERED). `streaming-json` = NDJSON
  `{type: thought|text|end}`, the `end` event carries the full usage envelope. `--json-schema
  '<schema>'` constrains output and adds a parsed `structuredOutput` object (implies json).
- **Containment**: `--sandbox read-only` (Landlock/Seatbelt) for real filesystem read-only — NOT
  `--permission-mode plan` (does nothing headlessly). `--sandbox workspace` = write cwd+/tmp+~/.grok
  only. But NOTE (EXFIL-RISK): the sandbox's network restriction does NOT cover the in-process
  upload channel — data-minimize the checkout regardless of sandbox profile.
- `--allow`/`--deny` rules (Claude-Code `Bash(rm*)` syntax accepted); `--tools`/`--disallowed-tools`
  (headless-only, allowlist then subtract); `--disable-web-search`. `--always-approve` skips
  prompts — untrusted input only if already data-minimized + sandboxed.
- `--effort [high(default)/medium/low]` (also `--reasoning-effort`) for grok-4.5-class models;
  lighter models ignore it.
- `grok agent` is a SEPARATE ACP/JSON-RPC surface (stdio/serve for IDEs) with NO `-p` flag —
  headless single-prompt work is EXCLUSIVELY `grok -p`. Never write `grok agent -p`.
- Capture form: `out=$(grok … </dev/null); rc=$?` — never `grok … | tail` then `$?`.

### Gotchas — each row is an observed/verified failure

| Symptom | Cause | Fix |
|---|---|---|
| entire repo (history + secrets) leaves for xAI even on a trivial prompt | EXFIL-RISK — in-process upload channel (2026-07 incident, mitigated server-side only) | G2 DATA-MINIMIZE: scrubbed/throwaway checkout; never a secret-bearing repo; sandbox does NOT stop this channel |
| `--permission-mode plan` still writes files | PLAN-IS-NOT-READONLY headlessly | use `--sandbox read-only`; treat permission-mode as prompt-policy, not enforcement |
| no usage numbers anywhere | plain `-p` (default `plain` format) prints only the answer | pass `--output-format json`, read `.usage`/`.modelUsage` |
| `grok agent -p …` rejected as invalid | `grok agent` is the ACP/IDE surface, no `-p` flag exists there | single-prompt headless is `grok -p` only |
| model silently rejected, RC=1 + a printed list | id not present in `models_cache.json` | copy an exact id from `grok models`, or re-probe (CATALOG-BY-PROBE — the cache lags the account) |
| `grok --version` today ≠ yesterday | near-daily self-updating point releases | check `grok --version` + `~/.grok/CHANGELOG.md` before any load-bearing version fact; `--no-auto-update` in CI |
| exit code reads 0 after a failed run | `grok … \| tail` then `$?` returns the pipe's rc, not grok's | capture as `out=$(grok …); rc=$?` |

## Output contract

| Need | How | Reality |
|---|---|---|
| the answer | `--output-format json` → `.text` (or plain stdout) | clean; JSON is the machine-parseable form |
| per-call usage | `.usage` {input/output/cache_read/reasoning/total} + `.modelUsage` | METERED — richest of the house's three drive-* targets; real numbers |
| schema-constrained output | `--json-schema '<schema>'` → `.structuredOutput` | parsed object validated against the schema, alongside the raw `.text` |
| streaming | `--output-format streaming-json` | NDJSON `{type: thought|text|end}`; the `end` event carries the full usage envelope |
| multi-turn | `-s/--session-id`, `-r/--resume`, `-c/--continue` | sessions persisted under `~/.grok/sessions/<cwd>/<id>/` |
| spend ledger | ccusage? | UNVERIFIED for grok — catalog notes it; the API's own $-tier accounting is a separate surface |

## Embedding in Workflow scripts — the sonnet-wrapper pattern

Same contract as `driving-codex`: `agent()` cannot BE grok; a worker RUNS it. Every `agent()` call
passes `{model: 'sonnet'}` — the user-global PreToolUse hook denies the Workflow otherwise (policy
owned by `~/.claude/CLAUDE.md`, not here). The worker's prompt embeds the FULL recipe above
verbatim — paraphrase drifts — plus the G2 DATA-MINIMIZE confirmation and the G4 RELAY demand, so
the orchestrator gets observables, not opinions.

```js
const grokAudit = (target) => agent(
  `You drive the Grok Build CLI (xAI). FIRST confirm G2: is ${JSON.stringify(target)}'s checkout
   safe to expose to xAI (no live secrets, no sensitive history)? If not, STOP and report — do not
   run grok against it (EXFIL-RISK). Otherwise run exactly:
     timeout 300 grok -p 'Audit ${target} for correctness. Verdict + evidence.' \
       -m <model-id-from-catalog> --output-format json </dev/null
     rc=$?
   G4 RELAY: return exit code + the JSON envelope's .text + the full .usage/.modelUsage block —
   never fabricate a token number.`,
  {model: 'sonnet', phase: 'Audit', label: `grok:${target}`})
```

- **Heterogeneous cross-vendor verify**: grok is a THIRD independent vendor (xAI) alongside codex
  (OpenAI GPT via `driving-codex`), agy (Google/multi-vendor via `driving-antigravity`), and a
  Claude sonnet baseline — DISAGREEMENT across vendors is the signal, agreement is still not proof.
- **Parallel grok calls**: independent calls fan out one sonnet wrapper each; no contention/lock
  data recorded yet — present higher fan-out as unproven and re-probe before large panels.
- **Nesting**: `workflow()` nests one level only; the grok call adds none (it is Bash).
- **Selection (G5)**: unlike agy's NO-METER, grok gives a real cost axis — run the measured
  head-to-head (verdict quality + `usage.total_tokens` + wall time + the sonnet baseline arm)
  before promoting any model to a standing role. A dated worked example → `references/model-catalog.md`.

## Execution model — the modal invocation is SOLO

| Step | Mode | Why |
|---|---|---|
| choose model / effort / sandbox / containment / prompt | SOLO | judgment spine — cost, EXFIL-RISK, and task must sit in one context |
| a single grok call | SOLO (main-loop Bash) | spawn overhead exceeds the work |
| parallel grok calls | FAN-OUT — one sonnet wrapper per call | calls are independent; workers relay observables |
| availability probe | SOLO script | never spawn an agent to run a script |
| cross-model adjudication | SOLO | the verdict braids every vendor's evidence |

## MUST-NOT-FIRE — and the fire/no-fire set

FIRES:

| Ask | Why |
|---|---|
| 「grok を workflow に組み込みたい」 | core territory |
| 「Grok Build / grok CLI で監査させて」 | core territory |
| 「grok -p を headless で回す」 | wrapper pattern |
| 「grok のモデル一覧 / 使えるモデル」 | CATALOG-BY-PROBE |
| "grok -p hangs / returns nothing" | gotchas table |
| 「grok が repo を勝手にアップロードした / 情報漏洩が心配」 | EXFIL-RISK — the load-bearing law |
| "have sonnet drive grok in a draft→audit panel" | wrapper pattern |
| 「grok の usage / token を取りたい」 | METERED output contract |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| the `codex` subprocess (OpenAI GPT) | `driving-codex` |
| the `agy`/Antigravity subprocess (Google/multi-vendor) | `driving-antigravity` |
| `pipeline()`/`parallel()`/hook/subagent-policy mechanics of the CLAUDE harness | `operating-the-harness` |
| "xAI API pricing / raw REST API / grok-4.5 pricing" | NOT this skill — this drives the CLI binary; the raw xAI API is model-native, no skill exists — name it, don't claim one |
| 「プロンプトを改善して」 | `prompting-llms` |
| the log-parsing tool named `grok` (Elasticsearch/Logstash pattern matcher) | unrelated — NOT this skill; name it explicitly to avoid the collision |
| Groq (the hardware/inference vendor) | unrelated — NOT this skill (different company, different spelling) |
| `xai-org/grok-1` (2024 open-weights release) or `superagent-ai/grok-cli` (unrelated ~2.4k★ community API wrapper) | unrelated projects — NOT this skill |
| "what is Grok Build?" | trivial — no skill |

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `driving-codex` | CARDINALITY/PURPOSE — which BINARY: `codex exec` (OpenAI GPT, metered, sandboxed) → driving-codex; `grok -p` (xAI Grok, metered, sandboxed, EXFIL-RISK) → here. |
| `driving-antigravity` | CARDINALITY/PURPOSE — `agy` (Antigravity/Google, NO-METER, UNCONFINED, multi-vendor) → driving-antigravity; `grok` (xAI, METERED, real sandbox, EXFIL-RISK) → here. |
| `operating-the-harness` | PURPOSE — configuring the `claude` harness (hooks/settings/Workflow/subagents) → there; the `grok` subprocess → here. |
| `prompting-llms` | prompt WORDING → there; grok CLI mechanics → here. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/model-catalog.md` | DATED snapshot: probe-verified roster, EXFIL-RISK full writeup + graded sources, METERED envelope shape, PLAN-IS-NOT-READONLY evidence, sandbox profiles, auth methods, install/host notes, don't-conflate table, provenance grades | any model-name, availability, cost, incident, or 使い分け question |
| `scripts/probe-models.sh` | deterministic availability probe (floor — NOT semantic), tri-state AVAILABLE/INVALID_NAME/INCONCLUSIVE | G1 gate — before asserting availability |
| `tests/forge-verification-ledger.md` | forge provenance, probe log, calibration table, verification-fleet results | reforging this skill |
