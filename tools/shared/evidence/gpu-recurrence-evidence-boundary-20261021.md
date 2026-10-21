# GPU recurrence evidence boundary — 2026-10-21

## Verdict

**Initiating cause: UNESTABLISHED. Established phenomenon:** repeated guest/host
`D`/`dxg` request-completion waits were observed in four incident windows.
Reported teardown association exists in incidents 2 and 3, not a teardown-caused
mechanism. This does not establish a Windows-driver, WSL, CUDA-context-lifetime,
NVML, sampler, or parent-reaping cause.

**Validated owner-side fix:** **NONE.** No Windows driver change, WSL reset,
context-lifetime guard, or global concurrency reduction has a causal recovery or
prevention receipt. The commandless `ADMIT` result is a momentary capacity/health
read; it is not a GPU trial or a fix. Sampler evidence preservation and admission
refusal are bounded observability/safety behaviors, not root-cause repairs.

## Four incident windows

| Window | Frozen observation | What it establishes | Boundary |
| --- | --- | --- | --- |
| 1, about 09:20–09:26 JST | Owner supplied `nvidia-smi`, Julia, and driver-inspection tasks in `D` at `dxgvmb_send_sync_msg`; a Julia child was `Z`. It later self-cleared and the job completed. | A dxg-completion blockage occurred and later became absent without a reported intervention. | The 09:20 process observation and job receipt were not independently retained; self-clear is an endpoint, not a repair or a cause. |
| 2, about 10:06–10:12 JST | After a SAT score, a checkpoint said post-score teardown stalled. The snapshot contains leader `Zl` plus sibling TID `Dl` at `dxgvmb_send_sync_msg`, plus independent D/dxg callers. | A second dxg blockage is temporally correlated with reported teardown. | PPID and a shared wait channel are not a causal wait graph; no exit transition, parent wait result, request ID, or continuous D duration exists. |
| 3, 04:45–04:52Z | A recorded refusal had `leader_state=Z`, `task_state=D`, and dxg wait after two observations. The owner/peer reported finished small-GPU rows unable to exit; later readback saw other Julia and `btm` D/dxg tasks. | A third recurrence was sufficient for refusal at 04:45Z; this is a reported temporal teardown association, not causation. | Later absence is not recovery, duration, holder attribution, or driver diagnosis. |
| 4, about 05:40–05:50Z | The saved KTM-REGISTRY checkpoint says its first launch and five check-only probes found persistent dxg stall with two observations at least 3000 ms apart; its CPU import block was CUDA initializer blocking. | Another retained recurrence and repeated guard detections. | CPU initializer blocking is not automatically teardown-causal; no paired host request/completion, executing-driver identity, or fix receipt exists. |

Receipts: incident 1 is supplied evidence, including self-clear in
[GPU-STALL-20261021.md](../GPU-STALL-20261021.md). Incident 2's teardown
wording and mixed leader/task state are bounded in that same report. Incident 3
is recorded in [gpu-third-stall-readback-20261021.md](gpu-third-stall-readback-20261021.md).
Incident 4 is the saved checkpoint at
[/home/fuyu/.local/state/firedancer-admission/ktm-registry/halfway.md:3-10](/home/fuyu/.local/state/firedancer-admission/ktm-registry/halfway.md:3).

## Causal boundary

- The recurring phenomenon is dxg request-completion blocking, not a proven
  host-side initiating fault. The first report explicitly leaves both the host
  cause and request completer unknown. Source:
  [GPU-STALL-20261021.md](../GPU-STALL-20261021.md).
- Incidents 2 and 3 retain reported temporal teardown associations. Parentage and
  `wchan` do not prove that teardown blocked other callers, or caused/completed a
  wait. Source:
  [GPU-STALL-20261021.md](../GPU-STALL-20261021.md).
- Two observations at least 3 s apart do not prove deadlock, no GPU progress, or
  exclude a finite legitimate busy/queued driver wait. That residual is preserved.
- The 10:06–10:10 sampler records all took the pause branch, weakening a sole
  contemporaneous dotfiles-sampler hypothesis. They are periodic invocation
  outcomes, not a lossless NVML trace; unmanaged or in-flight activity remains
  open. The manually run `nvidia-smi` reported during the third incident is a
  confounder, not causal proof. Sources:
  [GPU-STALL-20261021.md](../GPU-STALL-20261021.md).
- Snapshot `etimes`, CPU-fixture timings, and `/proc` start times are not
  historical D durations. The CPU child/reap result neither reproduced persistent
  Julia Z nor establishes historical cause. Sources:
  [GPU-STALL-20261021.md](../GPU-STALL-20261021.md),
  [GPU-CHILD-REAP-CPU-20261021.md](../GPU-CHILD-REAP-CPU-20261021.md),
  [gpu-third-stall-readback-20261021.md](gpu-third-stall-readback-20261021.md).
- Existing Windows event/registry capture retained no matching Oct-21 reset/error,
  but that is not proof of no host fault. Registry version metadata is not a
  measurement of the executing driver. Sources:
  [GPU-STALL-20261021.md](../GPU-STALL-20261021.md).

## Owner-fix disposition

| Candidate | Disposition | Evidence boundary |
| --- | --- | --- |
| Windows driver change | **Not validated** | No driver-change experiment or executing-binary lineage; version metadata alone is insufficient. |
| WSL/driver reset or reboot | **Not validated** | It may restore availability operationally, but need for reset is not established, none was executed, and no causal repair receipt exists. |
| CUDA context keepalive/lifetime guard | **Not validated** | No implementation or controlled comparison exists; teardown itself is not proven causal. |
| Sampler repair / admission guard | **Not root-cause validated** | The sampler repair preserves evidence; the guard can refuse observed D/dxg at admission, but neither repairs an active wait nor proves prevention. |
| Restore one-job policy | **Rejected as an inference** | Published policy permits six; historical effective policy is unknown, and no evidence warrants reverting concurrency to one. |

The later commandless `ADMIT` was one 411 ms check-only success at 04:52:53Z;
it did not start a workload, acquire a slot, or promise future availability.
Source: [gpu-third-stall-admission-watch-20261021.md](gpu-third-stall-admission-watch-20261021.md).
The fourth `ktm-registry-parity` 4 GiB check-only endpoint admitted at
05:44:06Z / 14:44:06 JST; it is only that timestamped endpoint, not continuing
health at publication. Source: [gpu-fourth-admission-watch-20261021.md](gpu-fourth-admission-watch-20261021.md).

## Explicit unknowns

The initiating host request/lock; request identity and completion/cancellation
reason; host-versus-WSL-versus-driver attribution; executing driver lineage;
NVML activity provenance; first/last D transitions; parent wait/reap ordering;
and whether CUDA teardown initiates, merely observes, or is independent of the
wait are unknown. A self-clear, scope closure, reboot/reset recovery, or a clean
later scan cannot fill these gaps. Source:
[GPU-STALL-20261021.md](../GPU-STALL-20261021.md).

## One next discriminating passive capture

At the next naturally occurring recurrence, retain one append-only, passive
cross-host correlation record. Its minimum inputs are: (1) Linux monotonic time,
caller PID/TID plus `/proc` start time/cgroup, dxg wait entry/return, and wrapper
phase markers for CUDA teardown and parent wait; (2) host-side per-request
receive/completion/cancellation/reset records carrying the same request key and
timestamp; and (3) a clock-offset receipt. Also retain sampler child
PID/start/exit/reap timestamps, rather than treating an NVML snapshot as a
lossless trace. This specifies data, not an unreviewed Windows command or an
active experiment.

Outcomes discriminate as follows: a bounded completion with matching progress
supports the finite busy/queued-wait residual; a delayed or absent completion
supports a stalled-completion path; matched cancellation/reset distinguishes it;
a teardown marker with no host request preserves an owner-side/lifetime branch;
and unmatched records expose instrumentation gaps. Until then, do not select a
root cause or deploy a causal fix.

## Scope and release decision

This is one report-only evidence artifact: no tool behavior changed, so no
version, CHANGELOG entry, fixture, or release changeset is appropriate.
