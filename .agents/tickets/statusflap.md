+++
schema = 2
name = "statusflap"
outcome = "the statusline worker block never flips between the run rows and `agx n/a (dispatch timeout 2000ms)`: a slow or failed `agx ls --json` keeps the last good rows on screen with an age marker, and acquisition is off the render path"
writes = ["tools/statusline/**", "agents/hooks/**", "tools/agx/**", "scripts/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 2400
premises = ["symbol:routeLines"]

[proposition]
id = "NO-FLAP"
claim = "a render whose agx read is slow or fails shows the previous good rows (marked by age), never the n/a line, while a good snapshot younger than the stale bound exists"
refuted_by = "a test where `agx ls --json` exceeds the deadline after one good read renders `agx n/a`, or the rows vanish"
+++

The user's complaint (2026-10-14, verbatim): "2つの表示を行き来して 鬱陶しいです。 DevXが悪い。" (the display keeps
switching between two states; annoying; bad DevX).
Observed in firedancer's session at CPU 99%, under a ~2 MB records.jsonl: consecutive renders alternate between
1. `agx n/a (dispatch timeout 2000ms)`, and
2. the proper run rows: `luna-high 18m03s $0.11 01a1..61c6 v4_learn │ working · $ mise run commit …`, then
   `+6 in other sessions · stale 17`.

Cause class: the statusline acquires its data inside its render, by spawning `agx ls --json`, which folds the whole
record log under a 2000 ms deadline. Under load the fold sometimes misses the deadline, and the presenter then
replaces the good data with an error.

Design (Unix: separate acquire, transform and present; the presenter only reads):
1. Locate the code: `rr text 'dispatch timeout'`, and `routeLines` in dispatch-runs.ts.
2. Acquisition writes a snapshot file: the `agx ls --json` output, the time it was taken and its exit, under
   $XDG_RUNTIME_DIR or the agx state dir. Write it atomically (temp file, then rename). The renderer reads the snapshot.
   If the snapshot is older than a refresh interval (~5 s), the renderer starts ONE detached-but-observable refresh,
   guarded by a lock so concurrent statuslines in many sessions do not each spawn agx. The renderer never waits on agx.
3. On a failed or slow refresh, keep the previous snapshot. Show the rows with an age suffix only when the snapshot is
   older than ~30 s (for example `agx 42s old`). Show `agx n/a (<reason>)` only when no snapshot younger than the stale
   bound (~10 min) exists.
4. Measure `agx ls --json` wall time on the real records (read-only) and report it. Report a slow fold as a number;
   optimize agx here only if the win is trivial.
5. Tests: good, then slow, then a render keeps the rows; no snapshot gives n/a; an old snapshot gets the age marker;
   concurrent renders start one refresh.
Before/after evidence: run the installed renderer and the workspace renderer three times each with a slowed agx (a
fake agx on PATH that sleeps), and paste the lines. Do not edit the real HOME. Do not commit or push.

## Current state (coordinator, 2026-10-15 15:00)
Run eff1a5e7's design is accepted. land failed at commit on `lint:ts` with six errors in this ticket's own files:
  tools/statusline/tests/agx-snapshot.test.ts:65:26 eslint(no-control-regex) Unexpected control character
  tools/statusline/tests/agx-snapshot.test.ts:65:25 unicorn(escape-case) use `\u001B` (uppercase)
  tools/statusline/src/agx-snapshot.ts:208:3 eslint-js(no-restricted-syntax) try is banned: errors as values
    (neverthrow fromThrowable/fromAsyncThrowable, or agents/hooks/attempt.ts; cleanup via using/DisposableStack)
  tools/statusline/src/agx-snapshot.ts:203:6 typescript(strict-boolean-expressions) nullable boolean in conditional
  tools/statusline/src/agx-snapshot.ts:228:9 typescript(strict-boolean-expressions) nullable boolean in conditional
  tools/statusline/tests/agx-snapshot.test.ts:19:16 typescript(no-confusing-void-expression) add braces
Fix exactly these without changing behavior (strip ANSI with an existing helper or a non-control-char approach);
run `bunx --bun oxlint --type-aware tools/statusline` and `bun test tools/statusline/tests/agx-snapshot.test.ts`
until both pass, then `mise run gate:land`. Other suite failures you saw (ccc-daemon deploy tests, doctor
reservation-yield, rumdl on PATH) are not yours; ignore them. No rebase needed (land rebases).
