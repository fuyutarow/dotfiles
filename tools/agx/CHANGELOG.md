# Changelog

## 2.0.1 — 2026-10-09

- Merge previous state into an existing agx directory with deduplicated, timestamp-ordered JSONL logs and byte-checked file conflicts. Commit through temporary files and rename for crash-safe, idempotent retries.
- Preserve live run markers and owned files while migrating unrelated state; report remaining files with exit 3. Add `--wait` with 30-second polling and `--wait-max` (default four hours), and remove the old directory only after a complete merge empties it.

## 2.0.0 — 2026-10-09

- Rename the suite to `agx` with exactly four nouns: `ticket`, `pick`, `dispatch`, and `ledger`. Resume with `agx dispatch --resume`; replay tickets with `agx ticket replay`; acknowledge artifacts with `agx ledger note`. Remove the former command aliases.
- Move runtime state to `~/.local/state/agx/` with an explicit, guarded `agx:migrate-state` task; runtime readers never use the previous directory.

## 1.19.0 — 2026-10-09

- Preserve `returned` for valid RETURN blocks even with no changed files or failing verification; record verification separately and identify the first coordinator question in receipts and stderr. RETURNs never auto-escalate.
- Resume owner-approved rows in the same session on escalation. Other escalations deterministically choose the cheapest available row at or above the failed row's AA index, preferring the same family's next effort on price ties, without Jev sampling or epsilon. Assert and record the capability rule; stop for the coordinator when no safe escalation exists.
- Cover RETURN precedence, override resumes, sol-high/luna-low escalation, and downgrade rejection; align the fake Jev roster with required pricing fields.

## 1.18.0 — 2026-10-09

- Include declared-write filesystem mtime scans in progress and write-scope checks, including files ignored by VCS; use the scan when the target is not a repository.

## 1.17.0 — 2026-10-09

- Share Codex token pricing with the statusline and keep streaming usage/cost in progress files when the worker stream reports it.

## 1.16.0 — 2026-10-09

- Require a four-word free-text justification for xhigh/max rows and make epsilon exploration cost-aware, recording the rows that receive smoothing mass.

## 1.15.0 — 2026-10-09

- Persist cumulative worker token usage and row-priced live cost in progress files; prefer Claude's reported billed cost.
- Write worker cost to receipts and run records so the statusline can show the live dispatch cost.

## 1.14.0 — 2026-10-09

- Record declared-write runs with an empty checked delta as `non_delivery`, record an incident, and reuse the one-time stall escalation path; exclude non-delivery from accepted throughput and count it as a lineage failure.

## 1.13.0 — 2026-10-09

- Hard-mask Claude rows for tickets whose capabilities, write scopes, or timeout exceed their $2 and 60-turn run bound; record the reason in the pick receipt and fall back when all rows are masked.
- Tell Jev that Claude rows are bounded at $2 and 60 turns per run and should not be preferred for long multi-file implementation.

## 1.12.0 — 2026-10-09

- Stop a run at first_return_s when it has neither a valid RETURN nor any changed file (commands alone are not progress), record it as `stalled` with a `stalled_at_first_return` incident, and re-dispatch it once on a pick that masks the stalled row and every lower-or-equal effort of its model family; the receipt carries `escalated_from`.
- A second stall is recorded and exits non-zero without another escalation; runs with a RETURN or changed files keep running to their hard bound, and `resume` is unchanged.

## 1.11.0 — 2026-10-09

- Add an owner-approved row override: `agent-dispatch run --row <id> --approval "<owner approval>"` runs the worker on that roster row without a Jev pick and records the pick as source `override` with the approval note.
- Refuse `--row` without `--approval`, or with an unknown row id, with exit 2 and a named reason; `--choice` stays refused and its message points at `--row/--approval`.

## 1.10.0 — 2026-10-09

- Give Jev per-kind records and label thin history as “record thin → weigh benchmarks.”
- Export/import records per capability tag with `record export` and `record import` subcommands.
- Preserve comparable-ticket throughput, route masking, softmax sampling, and stale-worker marker handling.

## 1.9.0 — 2026-10-09

- Smooth eligible Jev row probabilities with default epsilon 0.1 before temperature sampling, preserving hard masks and recording epsilon plus sampled probability.

## 1.8.0 — 2026-10-09

- Add portable per-row record export/import and merge imported records into pick requests when local evidence has fewer than three runs.

## 1.7.0 — 2026-10-09

- Sample a reproducible row from Jev probabilities after route, budget, and effort masking; record the sampling decision and preserve it on resume.

## 1.6.0 — 2026-10-09

- For resource-envelope briefs, probe once per worker process whether Codex's sandbox blocks the host user bus or an available GPU device; fall back to unsandboxed execution with a recorded reason when it does. Noncompute briefs do not probe.

## 1.5.7 — 2026-10-09

- Give Jev per-ticket throughput from comparable capability tags and ticket size classes, mark the best observed row, and state thin history per row without substituting overall averages.
- Treat active markers held by dead pids as released for worker-name uniqueness.

## 1.5.6 — 2026-10-09

- Include seven-day per-capability records beside each row's overall record in Jev's request, marking records below five runs as little; cache the latest bounded statistics snapshot.
- Mask rows with two lineage failures, partial grades, or returned runs without acknowledgement from Jev's candidates; record reasons and keep the overall-record argmax available when every row would be masked.

## 1.5.5 — 2026-10-09

- Make `first_return_s` observational: record whether a RETURN or progress appeared by its deadline without interrupting Codex or forcing a wrap-up turn; `timeout_s` remains the worker kill bound. Keep process-group reaping after worker exit; this release cannot safely distinguish every tool-call descendant from other group members, and records any survivors.
- Let ungraded runs without verify emit one warning instead of blocking the next dispatch, and resolve both normalized and legacy hyphenated worker display IDs.

## 1.5.4 — 2026-10-09

- Normalize hyphens in named worker display IDs to underscores, resolve either spelling, and refuse other characters.

## 1.5.3 — 2026-10-09

- Apply the requested stats window consistently, report grading overhead by component while excluding ticket verification from `--check`, and explain that returned runs count as accepted only after acknowledgement.

## 1.5.2 — 2026-10-09

- Add case-preserving `agt_<name>` worker display IDs from `run --name` or ticket `name`, with host-live uniqueness, generated IDs, ID lookup, and resume continuity; show them in statusline worker rows.

## 1.5.1 — 2026-10-09

- Route by expected useful throughput using recent per-row first-return, timeout, acceptance, and cost-per-accepted records, with benchmark scores used when the record is thin.
- Add optional positive ticket `budget_usd` for the cost exclusion decision; bound record loading to the recent log tail and record stats-read failures without stopping dispatch.

## 1.5.0 — 2026-10-08

- Add optional schema 1 and 2 ticket premises for file paths and exact-text symbols; check them before Jev with a five-second bound, refuse missing premises before spawning, and record timeout skips.
- Ask the grader to suggest premises for named dependencies and require an integration/acceptance piece when split pieces depend on one another.

## 1.4.3 — 2026-10-08

- Keep a change with its own acceptance check in one deliverable, including tests, seals, required params/config, and paired claim bounds; the firedancer field report said roughly 12 briefs were remanded as containers in an hour while the GPU idled, including an implementation split from its bit-identity test, an implementation split from its seal and params files (remanded twice), and a theorem split between lower and upper bounds.
- Keep dependent or mutually-referencing sections of read-only design/proof tickets together; allow read-only splits only for independent questions, while exact-input requests remain clarifications.

## 1.4.2 — 2026-10-08

- Preserve grader pass violations as printed warnings, drop unknown/self split dependencies with recorded warnings, and tolerate trailing commas in grader JSON.

## 1.4.1 — 2026-10-08

- Keep grader `clarify` verdicts as recorded warnings with their questions; only a valid `split` refuses a schema 2 ticket, with `urgent_reason` still downgrading that refusal. The 1.4.0 replay over 32 real legacy briefs falsely refused all 4 successful small single-deliverable briefs; among 11 indivisible sol-max briefs it returned clarify 8 and split 1; among 11 decomposable briefs it returned split 6, clarify 3, pass 1 and failed 1. Four of 32 graders also proposed overlapping writes without `depends_on`.
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
