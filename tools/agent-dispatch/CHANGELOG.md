# Changelog

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
