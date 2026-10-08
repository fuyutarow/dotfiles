# Changelog

## 1.4.1 — 2026-10-08

- Keep grader `clarify` verdicts as recorded warnings with their questions; only a valid `split` refuses a schema 2 ticket, with `urgent_reason` still downgrading that refusal. Model-free floor violations still refuse. The 1.4.0 replay over 32 real legacy briefs falsely refused all 4 successful small single-deliverable briefs; among 11 indivisible sol-max briefs it returned clarify 8 and split 1; among 11 decomposable briefs it returned split 6, clarify 3, pass 1 and failed 1. Four of 32 graders also proposed overlapping writes without `depends_on`.
- Tell the grader to order overlapping writes with `depends_on` or merge those pieces, and to pass a single final deliverable while placing underspecification questions in `questions`.

## 1.4.0 — 2026-10-08

- Add `ack` records for consumed/rejected artifacts. Make `stats` default to per-row and per-dispatcher throughput, with the prior report available as the legacy view; report accepted returns per worker hour, first-return median, timeout/acceptance rates, cost per accepted artifact, wasted tokens, and grading overhead/saves. `stats --grading --check` fails when grading time and cost exceed estimated saves.
- Add offline `stats --replay <candidate.json>` comparisons for accepted returns per hour, with the row-task independence assumption printed. Derive first-return timing, accepted artifacts, tokens, cost, and wasted tokens from run, grade, refusal, and acknowledgement rows.
- Refuse plain briefs and schema 1 tickets with model-free floor violations; `--legacy-brief "<why>"` records the one-release escape. Schema 1 floor-pass tickets still run.
- Make `grade-replay` show floor violations, grader status/verdict, piece count and validity, and failure/skip reasons per brief; report agreement and false-refusal both for merged verdicts and grader verdicts alone. Valid actionable splits now win over floor `clarify` while retaining floor violations, and CRLF fenced grader replies parse correctly.
- Treat `first_return` as a checkpoint of the same final deliverable and a same-rule multi-file operation as one deliverable. Reject checkpoint-only, recursive (`split_from`), and file-list-only splits; record rejected grader splits and count matching `--no-grader` overrides as likely false splits.
- Allow schema 2 grader remands to proceed with a recorded `urgent_reason` while preserving floor refusals. Count urgent and `--no-grader` overrides separately, and charge refusal overhead through the same dispatcher's next dispatch.
- Record and warn on worker `claims_without_diff` when a ticket declares writes but the worker claims edits without a writes diff; grade fail unless a passing verify proves otherwise. Isolate checkpoint test process groups so signal-based cleanup cannot terminate the test runner.

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
