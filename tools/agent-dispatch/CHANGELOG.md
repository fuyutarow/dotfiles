# Changelog

## 1.3.2 — 2026-10-08

- Run a bounded, read-only grader worker selected by Jev from the roster; record its pick, row, status, elapsed time, usage and cost inside the parent receipt, and fall back to the floor on any grader failure without refusing the run.
- Validate each proposed piece as a schema 2 ticket against the model-free floor, and reject overlapping writes unless `depends_on` orders the pieces. Schema 2 split/clarify grades remand with actionable violations and ready-to-paste pieces or questions; schema 1/plain grades remain warnings.
- Add `grade-replay <dir> [--expect <file.tsv>]` to grade fixture briefs without starting their real workers and report agreement plus false-refusal rate; `--no-grader` skips grading and records that choice.
- Fix checkpoint receipts so `worker.elapsed_s` covers the whole run and the wrap-up turn is recorded separately as `checkpoint.wrap_up_s`.
- Align the checkpoint timer and `fired_at_s` to the worker-start origin; a new resume starts a fresh first-return window.

## 1.3.1 — 2026-10-08

- Set the default worker bound to 600 seconds, add a 360-second first-return window, and require a reason above 600 seconds.
- Add model-free pre-run ticket remands and schema 2 enforcement; schema 1 and plain briefs receive warnings until refusal moves to 1.4.0.
- Ask Jev to prefer the lowest family effort unless ticket capabilities explain what lower effort measurably lacks.
- At `first_return_s`, Codex stops and resumes the same session with a RETURN prompt; a RETURN at that checkpoint is success. Claude receipts record `checkpoint: { supported: false, reason: "claude worker takes its prompt at start; no live injection" }` and Claude remains bounded by the hard timeout.

## 1.3.0 — 2026-10-08

- Set the default worker time box to 900 seconds; require a recorded reason above 1800 seconds, up to the 14400-second hard maximum.
- Add worker RETURN triggers and a validated `agent-dispatch-return` record; returned work is a success and remains eligible for ticket verification.
- Preserve RETURN data or an explicit no-RETURN note in timeout partial reports.

## 1.2.1 — 2026-10-08

- Add Codex guidance for safe `apply_patch` calls and stop workers after five identical consecutive tool errors, preserving a resumable partial report.

## 1.2.0 — 2026-10-08

- Add ticket and CLI worker wall-clock bounds up to 14400 seconds, with effective bound and source recorded per run.
- Show every blocking ungraded run with its cwd, label, finish time, and individual grade or waive commands.
- Always retain a harness-written partial report when the worker time bound expires.
- Correct the grading test to cover automatic waiver behavior when Jev is unavailable.

## 1.1.3 — 2026-10-08

- Add Claude Haiku 5.5 rows (`haiku-low` through `haiku-max`) with official pricing and Artificial Analysis figures.
- When codex is unavailable, the Claude fallback is now the cheapest Claude row, `haiku-low`.

## 1.1.1 — 2026-10-08

- Route Jev auto-picks through the official TypeSafe API.

## 1.1.0 — 2026-10-08

- Folded the Codex worker into agent-dispatch: removed the `codex-run` bin and moved the host declaration to `~/.config/agent-dispatch/host.toml`.

## 1.0.0 — 2026-10-07

- Moved from `agents/routing-control/`; behavior unchanged.
