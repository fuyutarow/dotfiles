# Agent resource runner

A thin Linux composition of flock and user systemd. The manifest schema lives in
[orchestrating-agents P7](../../agents/skills/orchestrating-agents/references/measurement-and-resources.md).

GPU jobs acquire one of the flock files at
`$XDG_RUNTIME_DIR/agent-resource/slots/gpu.<n>`, with the count from
`resource-policy.toml:gpu_max_concurrent_jobs`. Each acquisition waits at most
`min(900, walltime_seconds)` seconds and returns 75 on timeout. Named Julia compile
slots use the same mechanism and the existing `~/.config/agent-resource/slots.toml`
capacity declaration. No FIFO order is promised.

The declared default permits up to six concurrent GPU job scopes per
`gpu.<gpu_id>` slot pool in this user's runtime directory. Different device IDs
use separate pools; this is not a host-wide or cross-user GPU lock. Six is only a
count ceiling: live admission sums the other jobs' declared VRAM reservations for
the requested device, excludes the current reservation, and keeps the configured
safety margin. A job is admitted only when that sum plus its own declared peak
fits the available declared VRAM budget. Children count as part of their job;
devices, process counts and leftover slot files do not increase the ceiling. The
count is not a device or process limit and does not guarantee that a driver safely
supports concurrent jobs. By default, the runner reads the
`resource-policy.toml` beside its source package (`tools/agent-resource-run/resource-policy.toml`
in this checkout). `AGENT_RESOURCE_POLICY` selects a caller-supplied policy instead
and must be an absolute path.

Before taking a GPU slot, research writes a unique want file under
`$XDG_RUNTIME_DIR/agent-resource/gpu-wants/` and waits with `flock --shared -w`
on `agent-resource/ccc-gpu.lock`. The ccc supervisor holds that lock exclusively
through the exit of its GPU daemon child. It watches wants with inotify, asks the
child to finish its current batch, and releases ownership only after process exit
has destroyed the CUDA context and VRAM allocations. There is no grace timer.
The research process retains shared ownership through slot release and scope
cleanup; its want is removed afterward. Multiple research jobs can hold shared
ownership concurrently. A timeout returns 75 and removes the caller's want.

ccc defers embeddings during research instead of moving them to CPU. Its supervisor
resumes the GPU child only when both wants and held slots are absent. Supervised
clients cannot lazily spawn another daemon; requests during the handoff can fail
and should be retried after research. An abruptly killed runner can leave a want
file: this fails closed. Remove that file only after verifying its recorded PID
and research scope have exited. Never unlink lock files, which would split ownership
across different inodes. Operator stops still belong to systemd; deployment only
enables the service and never starts it.

Every command runs in its own `systemd-run --user --scope --collect` scope with
MemoryMax, MemoryHigh, zero swap, CPUQuota, TasksMax, RuntimeMaxSec and OOMPolicy=kill.
Before launch, the scope child verifies the effective RAM/swap ceiling and pids.peak.
GPU slot locks are held by a separate systemd-owned holder scope, outside the caller's
service cgroup. The holder launches the bounded job scope and stays alive while cleanup
is confirmed, so stopping the caller cannot release a GPU slot while its job remains.
The flock child retains its descriptors until systemd has stopped all descendants.
If scope cleanup fails, times out, or leaves its cgroup populated, it reports HOLD,
retains the slots and retries until the cgroup is empty or removed. A cleanup error
never authorizes another job.
The runner returns the command's exit status, including scope OOM and walltime kills.
VRAM budget environment variables remain for the firedancer model runner. GPU admission
sums declared GPU reservation peaks against cached device total minus the safety margin,
deduplicating job and holder scopes by reservation ID and excluding the current reservation
on its in-scope recheck. There is no sampled runtime VRAM enforcement.
There is no CPU-set allocator, resource ledger, sampled monitor or peak persistence.

`--manifest`, `--check-only`, `--job-id`, `--slot julia-compile` and `status`
retain their invocation forms. DENY is 69, recovery HOLD is 70, flock timeout is 75.
The inherited admission receipt and its digest remain available to polysearch's gate;
each scope exposes its own cgroup v2 pids.peak. CPU_IDS is compatibility metadata,
not exclusive affinity. Thread-count environment variables remain bounded.

The runner does not retry a health denial, silently retry a launched command, or enter
an unbounded admission loop. It performs admission confirmation only; caller retry and
recovery remain caller responsibilities.

## Bounded caller retry recipe

Use a separate, commandless `--check-only` invocation to decide whether to wait and
try admission again. This is the one safe prelaunch boundary: `--check-only` rejects a
command, so no underlying workload can have run in that invocation. Treat it as a
retryable external-health denial only when **both** of these are true:

- It exits 69 and its runner-produced diagnostic begins `DENY GPU persistent dxg stall`
  (either the `pid=` form or the `tgid=`/`tid=` form).
- That same diagnostic contains `observations=2 interval_ms>=3000` and its evidence
  paths. This is the runner's confirmed two-observation dxg result, not a single D
  observation or a claim of continuous persistence.

For one caller operation, take at most five commandless admission probes:

1. Before the first probe, set one absolute deadline `D` that is no later than the
   caller's walltime deadline. The caller must enforce `D` around every probe, wait,
   and eventual launch; the manifest's `RuntimeMaxSec` is a per-launch limit, not a
   replacement for this operation-wide deadline.
2. Run `agent-resource-run --manifest "$manifest" --check-only` with no command. If it
   admits, make exactly one normal launch invocation before `D` and do not put that
   invocation in this retry loop.
3. Only for the confirmed diagnostic above, and only while enough time remains before
   `D`, wait before probes 2--5. Use base delays of 3, 6, 12, and 24 seconds,
   respectively; multiply each by independently chosen jitter in `0.8..1.2`, then use
   `min(30 seconds, jittered delay)`. Stop instead of sleeping or launching past `D`.
4. Stop after five probes, any other result, or the deadline. Surface the diagnostic to
   an operator; do not convert exhaustion into a command replay.

`DENY` (69) and flock timeout (75) are status classes, not replay predicates. In a
normal launch, the runner passes through the underlying command's exit status, so a
workload may itself return 69 or 75. The launch path also emits unstructured
human-readable output around scope entry and release. It exposes no machine-verifiable
``launched`` or ``not launched`` field and `status` cannot reconstruct that outcome.
Consequently, after any normal launch returns 69 or 75--including output that appears
to be a scope-entry denial--the caller must report an unknown launch outcome and must
not blindly replay the command. The same refusal applies when the caller did not retain
the complete commandless `--check-only` diagnostic above.

Do not retry any of the following as external-health recovery: invalid manifest, policy,
slot, or job-id declarations (usage diagnostics); incomplete, invalid, unavailable, or
mismatched admission receipts; unavailable Linux/user-systemd enforcement; duplicate
job identity; fresh `HOLD RECOVER_VERDICT`; recorded `GPU stall recorded since` state;
unreadable/invalid process, task, or confirmation evidence; unavailable GPU owner or
device capacity; an outside/unreceipted holder; or `GPU VRAM budget exceeded`. Repair
or investigate those conditions instead. The last case is a live sum of declared
reservations against cached declared device total minus the policy safety margin; it is
not a measurement of temporarily usable runtime VRAM, and this runner has no separate
``usable VRAM`` retry diagnostic. DENY 69 and flock timeout 75 retain their separate
meanings.

A GPU-specific refusal uses live read-only `/proc/<tgid>/stat`,
`/proc/<tgid>/task/<tid>/stat`, and `wchan` evidence, independent of
`gpu-owner.json` being paused, stale, or missing `unresponsiveSince`. Every visible
numeric thread-group entry and its numeric task entries are inspected, including work
outside admitted scopes. A readable dxg candidate requires the same start-time identity
to be in D at a dxg wait channel again after one shared, bounded three-second confirmation
delay. That is two readable dxg observations at least three seconds apart, not proof that D
persisted continuously. A D-state leader reports its PID; a distinct D-state task reports
its TGID, TID, revalidated leader and task states, wait channel, and evidence paths; this
distinguishes a zombie leader from a live blocked task.

A task whose initial wait channel is unreadable, empty, or zero is a different candidate.
After the same shared delay, both TGID and TID start-time identities must still match and
the task must still be in D. Unknown-to-unknown refuses as persistent uncertain D with
`observations=2` and interval evidence. Unknown-to-dxg refuses as mixed wait-channel
evidence, not as two dxg observations. Unknown-to-readable-non-dxg, non-D, gone, or reused
task/leader identities discard the candidate. The leader's initial unavailable-wchan branch
retains its immediate fail-closed policy from the 1.5.12 scope; this task-only change does
not alter it.

Unreadable inventory/stat, malformed stat, or a task inventory that remains unavailable
for a live thread group also fails closed. The fast path has neither a readable-dxg candidate
nor a D-state task with an unavailable wait channel, so it does not sleep. A known non-dxg
wait does not itself refuse GPU admission. This admission snapshot does not prove future
driver health or prevent a stall that begins after the check.

Recorded `unresponsiveSince` still refuses admission and names recorded GPU-holding
PIDs and commands. Missing owner/capacity data also refuses admission; sample age or
paused status alone does not. Existing holder-scope and declared VRAM checks remain.
The runner never invokes the GPU driver.

Sampled-holder refusals include bounded provenance from the existing owner state.
Version 1 `processIdentity.sampleAt` must equal `sampledAt` and identify a retained
sample; exactly one observation must match the reported `rawDriverPid`. The diagnostic
reports capture times, local read/missing/reuse/permission status and local PID/TGID/NSpid
when available. Legacy missing metadata, a different sample, an unavailable or omitted
row, and invalid capture windows receive distinct labels. Raw proc contents, boot and
namespace values, command lines and unrelated rows are excluded from this provenance.
The collector PID identifies the sampler, not a driver-reported holder. These fields
come from the normal retained sample; admission adds no diagnostic probe or scan.

Operational LIMIT: the producer emits only `driverBinding: "unknown"`. Local numeric
PID equality, a local start time, or the sampler's namespace does not establish the
driver's PID namespace. Consequently, no currently emitted metadata can safely authorize
stale-PID removal. An absent, reused, nested or outside holder remains refused even with
correlated provenance. Existing live admitted-scope receipt checks and admission of an
empty driver process list retain their behavior; metadata never supplies an admission
receipt. Malformed metadata fails the owner-state schema check, and unrelated metadata
does not grant admission. Sample correlation describes the retained observation, not
proof that an old or paused sample describes the current driver.

These are admission-time checks (`--check-only` and the scope-entry recheck after CCC
handoff), not a continuous Z/D monitor. A cached zombie holder outside an admitted GPU
scope is refused; an admitted zombie is not independently refused for being Z. During
execution, systemd owns resource limits and deadlines. On cleanup, the controller checks
cgroup population and retains locks on unconfirmed cleanup; it does not classify Z/D
processes or automatically kill a workload because of this new dxg observation.
`status` reads slot holders from lslocks and the owner state without taking locks.

`resource-policy.toml` also retains capacity/partition values read by firedancer's
jq_capacity.py and the resident-service partition helper. These values are not an
aggregate reservation ledger in this runner. The Python helper remains resident-service
code; runner tests read its state path without loading CUDA.

Run the contract and real systemd integration tests with:

```sh
bun test tools/agent-resource-run agents/claude/hooks/tests/enforce-official-execution.test.ts
```

The tests use fake GPU work (sleep), deliberate bounded OOM, a RuntimeMaxSec overrun,
and independent scope task accounting. They require Linux and a live user manager.
The integration fixture preloads a test-only `/proc` inventory filter, restricting
child runners to processes with that fixture's `XDG_RUNTIME_DIR`. This prevents real
host stalls and other test sessions' receipts from contaminating fake-work tests.
The dxg unit fixtures separately exercise host-wide refusal outside admitted scopes;
production has no environment override for its `/proc` inventory.

GPU admission rationale and the dated OSS comparison are documented in [docs/](docs/).
