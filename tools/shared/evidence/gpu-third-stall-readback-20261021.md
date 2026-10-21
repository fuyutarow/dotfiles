# GPU third-stall readback — 2026-10-21

## Receipt boundary

This is a read-only, timestamped snapshot. It does not identify a driver cause,
perform recovery, run an admission probe, or assert that a holder wrapper is a
GPU workload. `starttime` values below are Linux `/proc/<pid>/stat` identity fields,
not process age and not a D-state duration.

## Observations (UTC / JST)

- **A — 2026-10-21T04:49:07Z / 13:49:07+09:00.**
  `gpu-owner.json` observed `paused:true`, `na:true`, `processes:[]`, and current
  holder `pid:1028453` (not the reported historical `967339`). `/proc/967339`
  was absent. Therefore no live identity, cgroup, or workload can be bound to
  `967339` at this observation.  
  Evidence: observed output from `sed .../gpu-owner.json`; `/proc/967339` check.
- **A holder binding — 04:49:26Z / 13:49:26+09:00.** PID `1028453` was
  `comm=bun`, TGID/TID `1028453`, state `S`, starttime `9176004`, in
  `agent-resource-holder-b35c65fb-b510-41cb-bb1a-02aad6ee4903.scope`.
  `systemctl --user status` identified that scope as the runner controller for
  `ktm-compose-value-pilot`, not Julia. This binds only the live slot-holder
  wrapper and scope; it does not identify a GPU-owning workload.
- **A blocked-task observation — 04:49:52Z / 13:49:52+09:00.** A separate
  live `julia` group had TGID `1028552`, TID `1047798`, task state `D`,
  `wchan=dxgvmb_send_sync_msg`, and task starttime `9183741`; its PPID was
  `1028466`. A separate `btm` group/TID `5278/5279` was also then in `D` at the
  same wait channel (task starttime `9526`). These are observed blocked tasks,
  not attribution of cause or proof that either owned GPU memory.
  Evidence: observed `/proc/*/task/*/{stat,wchan}` inventory output at A.
- **B re-read — 2026-10-21T04:50:38Z / 13:50:38+09:00 (over 3 s after A).**
  `/proc/1028552/task/1047798` and `/proc/5278/task/5279` were absent or
  reused before they could be revalidated; holder `1028453` was also absent.
  This is a later absence, not a statement that either earlier D observation
  was false, continuous, or recovered by any action.
- **C snapshot — 2026-10-21T04:51:47Z / 13:51:47+09:00.** The read-only scan
  found zero currently readable `*dxg*` wait channels. PID `967339`, `1028453`,
  and `1028552` were absent; PID `5278` was `S`. The owner file still said
  `paused:true`, `na:true`, `processes:[]`, now with holder `1080821`.
  At 04:52:08Z / 13:52:08+09:00, that holder was `bun`, TGID `1080821`,
  state `S`, starttime `9195812`, in
  `agent-resource-holder-aa439117-a664-447b-8dcd-8eb465b3572c.scope`.
  Thus a later clean scan does not disprove A; it only reports C's observation
  time and cannot establish an earlier D duration.

## Historical refusal versus current snapshot

`/home/fuyu/.local/state/firedancer-admission/ctw-impl/parity.log:3-6` records
the 04:45Z refusal as `tgid=967361 tid=976782 leader_state=Z task_state=D
wchan=dxgvmb_send_sync_msg; observations=2 interval_ms>=3000`, then code 69.
That recorded blocked TGID/TID is distinct from dispatch's reported cached-holder
PID `967339`; neither is the current owner-file holder. The saved
`halfway.md:1-3` only reports teardown blocked and canceled parity work; it does
not establish holder identity or a driver cause.

## Current classifier and commandless form

- Installed CLI readback: `agent-resource-run v1.5.12` (`--help` observed at
  04:49:07Z). `--resource` is absent from that flag list.
- [agent-resource-run.ts:150](https://github.com/fuyutarow/dotfiles/blob/09aaa33625027c5a2e4ba766ffc988c3533e4a75/tools/agent-resource-run/src/agent-resource-run.ts#L150)
  defines the 3000 ms confirmation interval; [lines 397 and 456](https://github.com/fuyutarow/dotfiles/blob/09aaa33625027c5a2e4ba766ffc988c3533e4a75/tools/agent-resource-run/src/agent-resource-run.ts#L397-L456)
  format refusal only after two observations and include PID or TGID/TID evidence
  paths. [Lines 473-475](https://github.com/fuyutarow/dotfiles/blob/09aaa33625027c5a2e4ba766ffc988c3533e4a75/tools/agent-resource-run/src/agent-resource-run.ts#L473-L475)
  wait and retain only same-identity candidates. [Lines 1127-1153](https://github.com/fuyutarow/dotfiles/blob/09aaa33625027c5a2e4ba766ffc988c3533e4a75/tools/agent-resource-run/src/agent-resource-run.ts#L1127-L1153)
  require `--manifest`, validate it, and reject a command with `--check-only`.
- `tools/agent-resource-run/README.md:75-93` specifies the sole safe form:
  `agent-resource-run --manifest "$manifest" --check-only`
  with no workload command. It can report `ADMIT`, but this worker did **not**
  invoke it; availability is therefore unobserved here.

## Verified manifest handoff

`/home/fuyu/.local/state/firedancer-admission/ctw-impl/gpu.resource.json:1`
is an existing caller declaration: schema `1`, job `ctw-impl-gpu`, and
`device.kind:"gpu"`, `gpu_id:0`, `vram_peak_bytes:2147483648`. It was read at
04:52:08Z without importing CUDA. The current parser's strict schema requires
these fields at [agent-resource-run.ts:44-87](https://github.com/fuyutarow/dotfiles/blob/09aaa33625027c5a2e4ba766ffc988c3533e4a75/tools/agent-resource-run/src/agent-resource-run.ts#L44-L87).
Its absolute path was published as the single line in
`/tmp/dotfiles-third-gpu-check-manifest-path.txt` for the designated watch
worker. This receipt makes no VRAM inference from the 64 KiB payload.

## Limits / next owner

No `nvidia-smi`, NVML, CUDA, probe, signal, restart, cleanup, lock change, or
notification was performed. The watch worker alone may run the commandless form
above and report its own timestamped admission result. Do not replay a workload
from this receipt; a current live guard result is required.
