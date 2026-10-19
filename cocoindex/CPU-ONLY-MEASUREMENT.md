# CCC CPU-only measurement — 2026-10-18, WSL R99

The restart path was `mise run deploy` → `scripts/post-merge.ts` →
`link:dots` → `deployCccDaemon()`. The previous implementation enabled the unit
and called `start` whenever `is-active` did not return `active`. The journal
records an explicit stop at 00:21:28 JST, a start at 01:21:04 JST, and GPU
initialization by PID 1034646 at 01:21:07 JST. The journal does not identify the
individual deploy caller; the implementation identifies the step that overrides
an explicit stop.

Deployment now installs, reloads and enables the unit without starting it.
Systemd does not distinguish a never-started inactive unit from an explicitly
stopped one reliably enough for deployment to infer permission. Both remain
inactive. Initial activation is an explicit `systemctl --user start ccc-daemon`
or `default.target` at login. Doctor reports an installed, stopped CPU-only unit
as WARN and explains explicit activation.

The WSL launcher hides CUDA before imports and overrides the native
`EmbeddingSettings.device` option to `cpu` when loading daemon settings. It also
overrides conflicting global environment settings in memory. Shared macOS
settings and the embedding model remain unchanged. Legacy GPU admission helpers
remain unused by this launcher. No CLI release changeset is needed.

## Runtime observation

The CPU launcher was started at 10:20:52 JST as PID 79236. A runtime-only drop-in,
`/run/user/1000/systemd/user/ccc-daemon.service.d/90-cpu-measurement.conf`, points
ExecStart to this workspace for measurement without modifying the main checkout.
It must remain until this change is landed; after landing, remove the drop-in,
reload systemd and explicitly restart using the canonical launcher.

Seven observations over 120.678 seconds found no PID 79236 in
`~/.local/state/gpu-owner.json`; all had zero consecutive probe misses and sample
ages below 120 seconds. The process list contained PID 54966, identified by `ps`
as a separate Julia `parity_v15.jl` job. No direct nvidia-smi probe or CUDA work
was added. `libcuda.so` is mapped by the CPU process; mapping alone does not prove
a GPU context, so the fresh sampler process list is the ownership evidence.

A concurrent deployment rewrote the installed unit to its previous GPU declaration
at 10:24:56 JST. The running CPU launcher and runtime ExecStart override remained
unchanged. Redeploying this workspace restored the CPU unit and doctor passed.
The coordinator must land the changes before relying on deployment persistence.

## Coralbase timing

The 2026-10-18 worker-bound attempt did not produce a completed timing before
the worker's 1800-second limit. The superseding unit result is recorded below.
The earlier measured command was `/usr/bin/time -f
'CORALBASE_CPU_INDEX elapsed=%e user=%U sys=%S maxrss_kb=%M' ccc index` in
`~/Workspace/coralbase`. The existing index had 1,197 files and 10,764 chunks;
this is an update of an existing index, without reset, under concurrent host load.
The device change can invalidate embedding memoization, so this is not a clean
cold-index or isolated throughput benchmark. An rr about request during the
update timed out; a second request returned BUSY (75).

At 10:40:21 JST the index reported 136 files listed, 1 added, 7 reprocessed,
0 deleted/unchanged, error 0. At 10:42:50 JST the same daemon was still running
with 21:58 elapsed since restart; the index command had not completed.

## Checks collected during this run

- `bun test scripts/tests/ccc-daemon.test.ts`: 19 pass, 0 fail.
- `bun test scripts/tests/ccc-gpu-yield.test.ts`: pass; includes the new mocked
  CPU launcher test. The real-CUDA test remains skipped.
- `uvx ruff check` and `uvx ruff format` for the launcher and CPU test: pass.
- `mise run lint:ts`: exit 0; no-sync baseline passed (913 sites, baseline 945).
- `mise run typecheck`: exit 0, 828 files.
- `mise run lint:bun`: exit 0, FAIL=0, WARN=10 outside this change.
- `mise run hook:pre-commit`: exit 0; last line `Finished in 164.14s`.
- `bun test scripts/tests tools/repo-retrieve`: 936 pass, 3 skip, 3 fail,
  1 error, 942 tests across 73 files, 1036.11 seconds. The failures were the
  land queue test's 60-second timeout, the Bun minimum manifest expectation,
  and the production Cleye corpus inventory. The land test passed alone in
  14.51 seconds; the other two failures reproduce alone and concern unchanged
  files. Full output is in `/tmp/ccc-cpu-tests.log`, isolated failures in
  `/tmp/ccc-cpu-baseline-failures.log`, and the land retry in
  `/tmp/ccc-cpu-land-retry.log`.

## Continuation — 2026-10-19

The explicit-stop check completed against the real local deploy path:

1. `systemctl --user stop ccc-daemon.service` produced inactive / MainPID=0.
2. `DEPLOY_SSH=/usr/bin/false mise run deploy` ran the local deps and post-merge
   steps. Remote SSH was disabled through the existing test seam because normal
   remote deploy runs `mise run pull`, which would violate this brief's no-rebase
   instruction. The local result was `ok (doctor FAIL 7)`; the whole command
   exited 1 because remote execution was deliberately refused. The local doctor
   failures concern other tools, not CCC.
3. After deploy completed (88.76 seconds), ccc was still inactive / MainPID=0.
4. The daemon was explicitly started again with the CPU launcher.

CCC 0.2.42's daemon dispatch calls `project.ensure_indexing_started()` on the
first SearchRequest and ProjectStatusRequest after restart, even when the caller
requests no refresh. The native embedder's memo key contains the device, so
switching from the previous GPU path to CPU can invalidate embeddings. This is
why the first search in the large firedancer corpus timed out: it starts an
initial index update. This verification does not claim that large existing
corpora are immediately queryable after the device change.

A dedicated one-file fixture lives in
`scripts/tests/fixtures/ccc-cpu-query/`. For the live check it was copied to
`/tmp/ccc-cpu-query-fixture-IejAjn` and indexed successfully with `rr index`.
The temporary project is outside the jj workspace because rr intentionally
refuses indexing a workspace in place of its backing repository. Its actual
index watermark records a verified absent Git HEAD; no watermark was fabricated.

For PID 1266414, seven gpu-owner reads spanning 120.721 seconds (121.456 seconds
for the whole check) covered three distinct sampler updates and found no ccc GPU
PID, with zero consecutive probe misses. The largest sample age was
46.273 seconds. The first two snapshots retained a vanished non-ccc PID; later
snapshots had an empty process list. `rr about 'CPU daemon preserves explicit
stop' --project /tmp/ccc-cpu-query-fixture-IejAjn --limit 1` returned exit 0 and
README.md:1-4 at both the beginning and end of the window (score 0.883).
The raw observation and both query results are in `/tmp/ccc-cpu-cont-watch.log`.

The coralbase measurement was moved outside the worker lifetime as instructed:

- Unit: `ccc-cpu-index-time.service` (started 2026-10-19 11:49:00 JST).
- Invocation: `6419f4bed70d43bfb4935e42055cdc3d`.
- WorkingDirectory: `~/Workspace/coralbase`.
- Command: `/usr/bin/time -f 'CORALBASE_CPU_INDEX elapsed=%e user=%U sys=%S maxrss_kb=%M' ~/.local/share/uv/tools/cocoindex-code/bin/ccc index`.
- The unit explicitly sets supervision and the same DB path mapping as the daemon.
- Read the eventual result with `journalctl --user -u ccc-cpu-index-time.service --no-pager`.
- `--collect` unloads the completed unit; the journal retains its time output.
- elapsed is wall time including waiting; user/sys/maxrss describe the client,
  while embedding compute and its resource ceilings belong to ccc-daemon.

The continuation reran all required checks in the foreground. `lint:ts`,
`typecheck`, `lint:bun`, and `lint:config-map` passed. The full test command
finished in 465.53 seconds: 937 pass, 3 skip, 2 fail. The remaining failures are
the unchanged Bun-minimum manifest expectation and production Cleye inventory;
the previous land timeout did not recur. Output is in
`/tmp/ccc-cpu-cont-tests.log`. No commit, push, rebase, tool version bump or
release changeset was made; this task changes daemon/deploy configuration and
adds verification fixtures, not a released tool CLI.

### Completed independent unit result

The unit finished at 2026-10-19 11:49:02 JST and was unloaded by --collect.
Its invocation journal records:

```text
Indexing: 539 files listed | 0 added, 0 deleted, 0 reprocessed, 539 unchanged, error: 0
Index stats: Chunks: 4809; Files: 539
CORALBASE_CPU_INDEX elapsed=1.98 user=0.31 sys=0.02 maxrss_kb=31988
```

This is a warm incremental CPU index pass with no embeddings reprocessed. It
does not measure cold CPU rebuild throughput or the abandoned earlier attempt.
The current corpus/settings also differ from the earlier 1,197-file state.
Retrieve this exact run using
`journalctl --user _SYSTEMD_INVOCATION_ID=6419f4bed70d43bfb4935e42055cdc3d --no-pager -o cat`.

The final continuation pre-commit check exited 0; its last line was
`Finished in 20.45s` (log: /tmp/ccc-cpu-cont-final-precommit.log).
At final inspection, ccc-daemon remained active as PID 1266414 with
CUDA_VISIBLE_DEVICES empty and the CPU launcher selected. Both its main PID
and resource-tracker PID were absent from gpu-owner.json.
