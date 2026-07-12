# Model catalog & fast-moving facts — verified 2026-07-12

> Everything in this file rots. Each claim carries its provenance grade (§ bottom); on reforge,
> re-run `scripts/probe-models.sh` and re-fetch official docs instead of trusting this snapshot.
> The durable rules (CATALOG-BY-PROBE, LEAST-PRIVILEGE, RELAY-VERBATIM) live in SKILL.md — this
> file holds only the perishable facts.

## Account catalog — probe-verified on THIS account, 2026-07-12

`codex exec --skip-git-repo-check --sandbox read-only -m <model> -c 'model_reasoning_effort="low"'
'Reply with exactly: OK' </dev/null` — exit 0 + `OK` = AVAILABLE.

| Model | Probe result | tokens used (trivial ping) |
|---|---|---|
| `gpt-5.6-sol` | AVAILABLE | 9,486 |
| `gpt-5.6-terra` | AVAILABLE | 9,278 |
| `gpt-5.6-luna` | AVAILABLE | 9,120 |
| `gpt-5.5` | AVAILABLE | 11,799 |
| `gpt-5.4-mini` | AVAILABLE | 10,766 |
| `gpt-5.4` | in `models_cache.json`; not probed |  |
| `codex-auto-review` | internal auto-review routing, not a general-purpose peer [third-party] |  |

## Environment facts (observed 2026-07-12)

- CLI: `codex-cli 0.144.1` at `~/.local/bin/codex`.
  - **CORRECTION (same day, later session)**: `~/.local/bin/codex` NO LONGER EXISTS on this host;
    the only binary is `/opt/homebrew/bin/codex` = **0.141.0** — a dual-install/PATH-shadowing
    trap: workers resolving `codex` from PATH got 0.141.0 and `gpt-5.6-sol` failed with a NEW
    error shape, exit 1 + 400 `"The 'gpt-5.6-sol' model requires a newer version of Codex.
    Please upgrade..."` — a VERSION-GATE 400, distinct from the ambiguous not-supported 400 in
    the triage table below. `gpt-5.5` probe-verified AVAILABLE on 0.141.0 (exit 0, 15,184
    tokens). Rule reinforced: `which -a codex` + version check before any model assumption.
- GPT-5.6 requires CLI ≥ 0.144.0; rollout is staged per account/workspace, so a current CLI can
  still lack a model [third-party — re-verify against official docs before load-bearing use;
  the version-gate 400 above is now probe-confirmed first-party evidence of the CLI floor].
- `~/.codex/config.toml` defaults: `model = "gpt-5.5"`, `model_reasoning_effort = "medium"` — a
  flagless `codex exec` runs THAT, at whatever sandbox the directory's trust level implies
  (a flagless run header showed `sandbox: danger-full-access` in a trusted workspace
  [user transcript, 2026-07-12]).
- `model_reasoning_effort` values seen working: `low` (probes), `medium` (config default),
  `xhigh` (run header in a user transcript, 2026-07-12); `high` assumed by symmetry [unverified].
- `models_cache.json` refreshes on use: mtime observed updating per run (author-confirmed);
  a prior session reported the cache lacking the 5.6 family entirely before any successful 5.6
  run [user-relayed]. Either way the load-bearing rule holds: the cache is authoritative in
  NEITHER direction — models absent from it ran fine when probed directly.
- Sandbox modes (`codex exec --help`): `read-only`, `workspace-write`, `danger-full-access`;
  plus `--dangerously-bypass-approvals-and-sandbox` (never in embedded use).

## Cost shape of a trivial call

`tokens used ≈ 9–12k` for a one-word reply — that is INITIAL CONTEXT (system + AGENTS.md +
skills, capped at a 2% skills budget + MCP), not output. `--json` usage on a repeat call:

```json
{"input_tokens":19257,"cached_input_tokens":9984,"output_tokens":5,"reasoning_output_tokens":0}
```

Repeat calls in the same workdir hit the cache for roughly half the input. Aggregate spend:
ccusage MCP `codex-daily` / `codex-monthly`.

## Error strings — exact triage table (probe-captured)

| Observation | Meaning |
|---|---|
| exit 0, expected reply | model available on this account, now |
| `warning: Model metadata for 'X' not found. Defaulting to fallback metadata` → `ERROR {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'X' model is not supported when using Codex with a ChatGPT account."}}`, exit 1 | AMBIGUOUS: wrong/short name of a real model, bogus name, or not rolled out — probe-verified byte-identical shape for `-m sol` (short name of the available `gpt-5.6-sol`) and `-m gpt-9.9-bogus` (nonexistent), both 2026-07-12 (the rule this fact grounds is C1's ASYMMETRY; home: SKILL.md) |
| 401 | authentication — `codex login status`; check WHICH account is logged in |
| 403 | account/workspace permission — model exists, you don't have it |
| `Not inside a trusted directory and --skip-git-repo-check was not specified`, exit 1 | git-trust check, NOT a model problem |
| `warning: Skill descriptions were shortened to fit the 2% skills context budget` | benign; codex-side skills listing pressure, not an error |

## Provenance grades

| Claim | Grade |
|---|---|
| probe table, error strings, config defaults, cache mtime refresh, cost shape, sandbox mode list | author-confirmed — probes run 2026-07-12; outputs appended in `tests/forge-verification-ledger.md` |
| `danger-full-access` / `xhigh` observed in flagless & explicit run headers; cache lacking the 5.6 family pre-rollout | user transcript / user-relayed (2026-07-12) — seen, but not by this forge's own probes |
| ≥0.144.0 floor, staged rollout, plan eligibility, recommended default | third-party — a ChatGPT answer relayed by the user (2026-07-12), not checked against official docs |
| `high` effort value; `codex-auto-review` = internal routing | unverified / third-party |
