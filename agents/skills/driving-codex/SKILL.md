---
name: driving-codex
description: >-
  Drives the OpenAI Codex CLI (codex exec) as a headless worker from Claude Code — direct Bash
  calls, Agent-tool subagents, and Workflow scripts where every agent() is a sonnet wrapper whose
  Bash runs codex. PURPOSE cut, decide by binary: configuring the claude harness itself (hooks,
  settings.json, Workflow tool semantics, subagent policy) → operating-the-harness; the codex
  subprocess → here. Anthropic API/model facts → claude-api; prompt wording craft → prompting-llms.
  Use when embedding codex/GPT into a pipeline (sonnet draft → codex audit, heterogeneous
  cross-vendor verification), probing which GPT models an account can run when the model picker or
  cache disagrees, choosing --sandbox / --skip-git-repo-check / model_reasoning_effort flags,
  parsing --json usage or --output-last-message, tracking codex spend with ccusage, or unsticking
  a hanging or failing codex exec. Triggers: codex, codex exec, Codex CLI, OpenAI CLI, gpt-5.6,
  sol / terra / luna, unknown model, models_cache, codex を workflow に組み込む, codex で監査,
  GPT にもレビューさせて, 異種モデル検証, モデルが一覧に出ない. LAW: the local
  model cache is a delivery snapshot, not the catalog — availability is a probe exit code, never
  memory or the picker; least-privilege sandbox always (danger-full-access only in isolated
  runners). Workflow-native: model/effort/sandbox/prompt choices and cross-model disagreement
  adjudication stay SOLO; parallel codex calls fan out one sonnet worker each. English skill;
  respond in the user's language (default Japanese).
---

# Driving Codex — the OpenAI Codex CLI as a headless worker

> **Version**: v2607.1.1 (2026-07-12 — reforged same day on a second session's production trace)
> **Scope**: embedding `codex exec` as a worker under Claude Code — solo Bash calls, Agent-tool
> subagents, Workflow scripts — plus model-availability probing, sandboxing, output parsing, and
> spend accounting. The `claude` harness itself (hooks, settings, Workflow tool semantics) is
> owned by `operating-the-harness`.
> **Durability contract**: this body asserts NO model IDs, token prices, CLI version numbers, or
> exact error strings as FACTS — every fast-moving fact lives in `references/model-catalog.md`
> under its dated header, and a model name asserted as fact in this body is a bug. Two declared
> exemptions, both dated bait re-verified on reforge (recorded in the ledger): the description's
> trigger tokens, and the F3 table's quoted example asks (realistic queries need real names).
> **Build order (atomic)**: `test -f references/model-catalog.md || echo MISSING catalog;
> test -x scripts/probe-models.sh || echo MISSING probe;
> test -f tests/forge-verification-ledger.md || echo MISSING ledger`
> Durable operating guidance from a frontier model (Fable 5, 2026-07) to whatever model executes
> this later — encodes failures observed in production. If a constraint here feels unnecessary,
> that feeling is the failure mode — follow the map.

## Language

Stable tokens even inside Japanese prose: **CATALOG-BY-PROBE**, **LEAST-PRIVILEGE**,
**RELAY-VERBATIM**, **RANK-BY-MEASUREMENT**, **wrapper**, **probe**, **fire / no-fire**.

## THE LAW

> Codex is a SUBPROCESS, not an agent type. You embed it by having the main loop — or a sonnet
> worker inside a Workflow — run `codex exec` via Bash, and the return value is the exit code
> plus the last agent message. Availability is **CATALOG-BY-PROBE**: the model picker and
> `~/.codex/models_cache.json` are delivery snapshots, not the catalog — a model's availability
> is proven by a direct `-m` probe's exit code, never asserted from the cache or from model
> memory (a frontier model's training data is ALWAYS stale about live model rollouts). The
> probe is ASYMMETRIC: exit 0 proves available; a 400 refusal proves only that THAT STRING is
> not served — see C1.
> Sandboxing is **LEAST-PRIVILEGE**: probes and audits run `read-only`; only edit tasks get
> `workspace-write`; `danger-full-access` never leaves an isolated runner. And availability is
> not rank — **RANK-BY-MEASUREMENT**: promotion to a standing role takes a measured
> head-to-head (C4), never name/version arithmetic.

## Gates

| Gate | Rule | Artifact |
|---|---|---|
| **C1 PROBE** | Before any claim that a model is / is not available: resolve the EXACT model ID (`references/model-catalog.md`, else official docs), run the probe, cite its RESULT line. ASYMMETRY — AVAILABLE is proof; UNAVAILABLE-400 is ambiguous (a short/typo'd name of a real model 400s byte-identically to a nonexistent or unrolled one; probe-verified). A negative probe on an unverified ID is a verdict about the STRING, not the model — no availability verdict | output of `bash ${CLAUDE_SKILL_DIR}/scripts/probe-models.sh <exact-id>...` + where the ID came from |
| **C2 FLAGS** | Every embedded call passes `-m`, `-c 'model_reasoning_effort=...'`, and `--sandbox` explicitly — a bare `codex exec` silently inherits `~/.codex/config.toml` defaults (model, effort) and the directory's trust level (sandbox) | the flag triplet greppable in the call |
| **C3 RELAY** | A worker that ran codex relays VERBATIM: exit code, the `tokens used` line, and the last agent message — "codex said PASS" without the observables is zero evidence | the verbatim triple in the worker's return |
| **C4 SELECT** | Availability is not rank: before promoting a model to a standing role (default auditor, standard reviewer), run one measured head-to-head on the actual task and cite it | the comparison (both models' verdicts + tokens) in the promotion decision |

## The invocation recipe — LOW freedom; deviations cost hangs and misfires

Step 0, before any call (C1): resolve the EXACT model ID from `references/model-catalog.md`
(or official docs when the catalog is stale). For availability checks, run
`bash ${CLAUDE_SKILL_DIR}/scripts/probe-models.sh <exact-id>...` — never hand-roll a probe:
the script owns the safe exit-code capture and the 400-ambiguity note.

```bash
timeout 600 codex exec \
  --skip-git-repo-check \
  --sandbox read-only \
  -C "$WORKDIR" \
  -m "$MODEL" \
  -c "model_reasoning_effort=\"$EFFORT\"" \
  -o "$OUT_FILE" \
  "$PROMPT" </dev/null
```

- Read the verdict as `rc=$?` on the very next line, or capture as `out=$(codex …); rc=$?` —
  never `$?` after a pipe (Gotchas).
- `--sandbox`: `read-only` (probes, audits, reviews) · `workspace-write` (codex edits files) ·
  `danger-full-access` (isolated CI runner ONLY).
- `-o/--output-last-message`: the file receives ONLY the final agent message — the clean
  machine-readable return value. `--json` replaces human output with JSONL events instead.
- `timeout`: codex has no built-in wall clock; wrap every embedded call.
- Current model IDs, effort values, defaults, per-call overhead → `references/model-catalog.md`.

### Gotchas — each row is an observed failure (2026-07-12; exact error strings live in `references/model-catalog.md`, the owner)

| Symptom | Cause | Fix |
|---|---|---|
| exit 1, "Not inside a trusted directory…" | cwd/`-C` target is not a trusted git dir | add `--skip-git-repo-check`, or `-C` into a trusted repo |
| "Reading additional input from stdin…" — stray text appended to the prompt, hang risk on an open pipe | non-TTY stdin is read as extra prompt input | always `</dev/null` in scripts (observed both ways: message present without the redirect, absent with it) |
| exit 1 + a 400 `invalid_request_error` naming the model | ambiguous: wrong/short ID of a REAL model, or genuinely not in this account's catalog — the error cannot tell them apart | C1: verify the exact ID against the catalog, re-probe; only then conclude |
| exit code reads 0 (or garbage) after a failed run | `codex … \| tail` then `$?` returns the PIPE's last command, not codex | capture as `out=$(codex …); rc=$?` (the recipe form), or read `PIPESTATUS[0]` |
| 401 / 403 errors | auth vs workspace permission | `codex login status`; wrong account ≠ missing model |
| run uses an unexpected model/effort/sandbox | flags omitted → config.toml + trust defaults applied | C2: pass the triplet explicitly |
| picker or cache lacks a model that actually works | cache is a snapshot, refreshed on use — authoritative in neither direction | C1: probe with direct `-m`; never conclude from the cache |

## Output contracts — pick one of three

| Need | Flag | Read |
|---|---|---|
| human-ish log | (none) | stdout tail: last message + `tokens used` / count |
| machine return value | `-o FILE` | file contains only the last agent message |
| full accounting | `--json` | JSONL events `thread.started / turn.started / item.completed / turn.completed`; usage = `jq 'select(.type=="turn.completed").usage'` → `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}` |

Aggregate spend across sessions: ccusage MCP tools `codex-daily` / `codex-monthly`.

## Embedding in Workflow scripts — the sonnet-wrapper pattern

`agent()` cannot BE codex; a worker can RUN it. Proven end-to-end at forge time (2026-07-12):
a live Workflow run's sonnet agent drove `codex exec` via Bash and relayed the C3 triple —
result recorded in the ledger.

1. Every `agent()` passes `{model: 'sonnet'}` — the user-global PreToolUse hook denies the
   Workflow otherwise (policy owned by `~/.claude/CLAUDE.md`, not here).
2. The worker's prompt embeds the FULL recipe above verbatim — paraphrase drifts — plus the C3
   RELAY demand.
3. The worker's final text = the C3 triple (+ any parsed JSON), so the orchestrator gets
   observables, not opinions.

```js
const codexAudit = (target) => agent(
  `You drive the Codex CLI. Run exactly:
   timeout 600 codex exec --skip-git-repo-check --sandbox read-only -C <repo> \
     -m <model-from-catalog> -c 'model_reasoning_effort="high"' \
     'Audit ${target} for correctness. Verdict + evidence.' </dev/null
   Relay VERBATIM: exit code, the "tokens used" line, the full final message.`,
  {model: 'sonnet', phase: 'Audit', label: `codex:${target}`})
```

- **Timing**: a trivial ping returns in tens of seconds; real tasks take minutes — `pipeline()`
  over items; a barrier across codex calls wastes wall-clock equal to the call spread.
- **Nesting**: `workflow()` nests one level only; the codex call adds none (it is Bash).
- **Patterns**: adversarial pair (sonnet drafts → codex audits → sonnet fixes; the orchestrator
  adjudicates); heterogeneous double-verify (same claim to a Claude worker AND codex —
  DISAGREEMENT is the signal to investigate; cross-vendor agreement is still not proof).
- **Selection (C4)**: the probe proves AVAILABILITY, never rank — model names and version
  numbers carry no quality ordering. Before promoting a model to a standing role (e.g. standard
  auditor), run one measured head-to-head on your own task: same prompt to both candidates,
  compare verdict quality and tokens used, then promote.

## Execution model — the modal invocation is SOLO

| Step | Mode | Why |
|---|---|---|
| choose model / effort / sandbox / prompt | SOLO | judgment spine — cost, risk, and task must sit in one context |
| a single codex call | SOLO (main-loop Bash) | spawn overhead exceeds the work |
| parallel codex calls | FAN-OUT — one sonnet wrapper per call | calls are independent; workers relay observables |
| availability probe | SOLO script | never spawn an agent to run a script |
| cross-model disagreement adjudication | SOLO | the verdict braids both sides' evidence |

Evidence type: **CITATION-RELAY** delta — workers CAN produce the evidence, but only the C3
triple crosses the trust boundary (owner: the Gates table); a relayed verdict without its
observable is quarantined. Generic agent contract by pointer: the `systematizing-knowledge`
orchestration reference. No harness → same map, serial Bash calls.

## MUST-NOT-FIRE — and the fire/no-fire set (F3)

FIRES:

| Ask | Why |
|---|---|
| 「codex を workflow に組み込んで利用したい」 | core territory |
| "have sonnet drive codex in a draft→audit pipeline" | wrapper pattern |
| 「gpt-5.6-sol 使える？ picker に出ないんだけど」 | CATALOG-BY-PROBE |
| 「この diff、GPT にもレビューさせて」 (no headline keyword) | heterogeneous verify |
| "codex exec hangs / returns nothing" | gotchas table |
| 「codex の今月のトークン消費は？」 | spend accounting |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| "difference between pipeline() and parallel()?" | `operating-the-harness` / model-native |
| 「subagent を全部 sonnet に固定する hook を書いて」 | `operating-the-harness` + update-config |
| "OpenAI API function calling の書き方" | no codex CLI involved — model-native (prompting-llms names an `openai-docs` owner; nonexistent as of 2026-07-12) |
| "which Claude model should I use, and pricing?" | `claude-api` |
| 「プロンプトを改善して」 | `prompting-llms` |
| "what is Codex?" | trivial — no skill |

Co-fire: 「codex を呼ぶ hook を settings.json に足して」 → `operating-the-harness` owns the hook
wiring FIRST; this skill supplies the codex invocation line.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `operating-the-harness` | PURPOSE — which binary is being configured: `claude` (hooks, settings, Workflow tool semantics, subagent policy) → there; the `codex` subprocess → here. Reciprocal pointer deferred — recorded in the ledger. |
| `prompting-llms` | PURPOSE — prompt WORDING → there; codex CLI mechanics → here. Its OpenAI cut names `openai-docs` (nonexistent, 2026-07-12); until that exists, OpenAI prompt craft is model-native, never this skill's excuse to fire. |
| `claude-api` | Anthropic API / Claude model facts → there; its own SKIP clause already routes OpenAI-named work away from itself. |
| `agents-sdk` | building agents on the Claude Agent SDK → there. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/model-catalog.md` | DATED snapshot: probe-verified account catalog, CLI version floor, cache-refresh behavior, config defaults, per-call token overhead, error strings, provenance grades | any model-name, availability, or cost question |
| `scripts/probe-models.sh` | deterministic availability probe (floor — NOT semantic) | C1 gate — before asserting availability |
| `tests/forge-verification-ledger.md` | forge provenance, calibration table, verification results | reforging this skill |
