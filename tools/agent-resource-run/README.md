# Agent resource runner

A thin Linux composition of flock and user systemd. The manifest schema lives in
[orchestrating-agents P7](../../agents/skills/orchestrating-agents/references/measurement-and-resources.md).

The required manifest is `schema`, `job_id`, `cpu_threads`, `processes`,
`host_ram_peak_bytes`, `device`, `walltime_seconds` and `cleanup`. Narrative or
compatibility fields (`run_class`, `memory_bound`, `scratch_bytes`, `child_fanout` and
CPU-device GPU rationale fields) may be omitted; parsing supplies compatibility defaults.
The host RAM hard limit remains required and must be positive.

GPU admission uses the existing sum of declared VRAM reservations, less the configured safety
margin and ccc partition. `gpu_max_concurrent_jobs` remains a parsed compatibility key and is
ignored. The runner takes no per-device GPU count lock. Julia compilation is unthrottled by this
runner and is bounded only by each job's own scope limits.
`compile_slots` and `--slot julia-compile` remain accepted compatibility no-ops.

Live admission sums the other jobs' declared VRAM reservations for the requested device,
excludes the current reservation, and keeps the configured safety margin and ccc partition.
A job is admitted only when that sum plus its own declared peak fits the available declared
VRAM budget. By default, the runner reads the
`resource-policy.toml` beside its source package (`tools/agent-resource-run/resource-policy.toml`
in this checkout). `AGENT_RESOURCE_POLICY` selects a caller-supplied policy instead
and must be an absolute path.

ccc and research share the GPU within separate declared budgets. Research takes only
its own job slot; it writes no ccc want and never waits on `ccc-gpu.lock`. The ccc
supervisor keeps its daemon running regardless of research wants or occupied slots.
ccc's allocator stays within its standing partition minus its context allowance;
it does not borrow research VRAM. Research admission subtracts the configured ccc
partition on its device as well as the safety margin, including when ccc is absent.

A sampled ccc holder is recognized without a warning when its correlated identity
and boot match a still-live child of the current supervisor in `ccc-daemon.service`,
with matching local start time and PID namespace. Other holder identities produce
advisory warnings and never refuse admission. The legacy `cccHandoffHeld` caller
option supplies no proof or permission. Operator stops and restart policy still
belong to systemd; deployment only enables the service and never starts it.

Every command runs in its own `systemd-run --user --scope --collect` scope with
MemoryMax, MemoryHigh, zero swap, CPUQuota, TasksMax, RuntimeMaxSec and OOMPolicy=kill.
`MemoryMax` is the manifest's `host_ram_peak_bytes`; `MemoryHigh` is its floor multiplied
by `memory_high_fraction` from `resource-policy.toml` (currently 0.9), so reclaim and
throttling begin below the hard limit. Before launch, the scope child verifies the
effective MemoryMax, policy-derived MemoryHigh, zero swap and pids.peak. The effective
cgroup memory limits are checked against page-aligned readback values from the kernel.
For GPU jobs, a separate systemd-owned holder scope stays outside the caller's service
cgroup. It launches the bounded job scope and stays alive while cleanup is confirmed,
preserving holder lifetime independently of the caller. `job_id` is a descriptive label,
not a lock identity; each invocation gets a unique
`reservation_id` for admission accounting. A manifest may set `output_lock` to a filesystem-safe
key when its command writes shared mutable output. That key takes an exclusive flock; a concurrent
writer with the same key is refused with DENY 69. The lock remains held through scope cleanup,
including the GPU holder lifetime.
The flock child retains its descriptors until systemd has stopped all descendants.
If scope cleanup fails, times out, or leaves its cgroup populated, it reports HOLD,
retains the slots and retries until the cgroup is empty or removed. A cleanup error
never authorizes another job.
The runner returns the command's exit status, including scope OOM and walltime kills.
VRAM budget environment variables remain for the example-repo model runner. GPU admission
sums declared GPU reservation peaks against cached device total minus the safety margin and ccc partition,
deduplicating job and holder scopes by reservation ID and excluding the current reservation
on its in-scope recheck. There is no sampled runtime VRAM enforcement.
There is no CPU-set allocator, resource ledger, sampled monitor or peak persistence.

`--manifest`, `--check-only`, `--job-id`, `--slot julia-compile` and `status`
retain their invocation forms. DENY is 69, recovery HOLD is 70, and bounded admission-lock
timeout is 75. Conflicting `output_lock` keys are refused immediately with 69.
The inherited admission receipt and its digest remain available to example-search's gate;
each scope exposes its own cgroup v2 pids.peak. CPU_IDS is compatibility metadata,
not exclusive affinity. Thread-count environment variables remain bounded.

The runner does not retry a health denial, silently retry a launched command, or enter
an unbounded admission loop. It performs admission confirmation only; caller retry and
recovery remain caller responsibilities.

## Caller launch boundary

A commandless `--check-only` invocation is the prelaunch boundary: it rejects a
command, so no underlying workload can have run in that invocation. Proc suspicion
admits work and requires no retry. A fresh owner incident requires operator recovery;
see [GPU recovery](../shared/GPU-RECOVERY.md). Capacity and RAM HOLD remain unchanged.

`DENY` (69) and flock timeout (75) are status classes, not replay predicates. A
normal launch passes through the command's exit status; callers must not blindly
replay a command after either status. C1 decision records distinguish prelaunch
refusal from launched command exits.

## GPU health admission

The runner scans read-only `/proc/<tgid>/stat`, task stat and wait channels across
visible processes. A readable dxg D-state candidate is observed ten times with nine
shared delays of at least three seconds. Waking, disappearing, changing starttime or
moving to a readable non-dxg channel discards the candidate. These samples do not
prove continuous persistence or establish detector accuracy.

**Proc observations are advisory.** A suspected wait or unavailable proc evidence
writes one `WARN dxg-suspected: ...` stderr line per admission check and records
`reason_code: dxg-suspected` with the evidence in the C1 decision record. The job
continues through owner and capacity checks. Unknown wait channels require either
a sampled PID plus a matching live starttime, or a readable `/dev/dxg` fd;
nonleader threads inherit the tie from their group. Numeric PID equality alone,
process names, root ownership and unreadable fd inventories do not establish a tie.

After confirmation, the runner re-reads the sampler state immediately before its
health decision. Only `unresponsiveSince` in that
fresh read refuses for a host incident; a latch cleared since the initial read does
not refuse, and a newly set latch does. Missing owner/device capacity data and excess
declared VRAM still refuse. An unavailable process inventory still refuses because
reservation capacity cannot be measured. Sample age and paused status alone do not refuse. The
declared VRAM sum, safety margin, ccc partition and RAM/recovery HOLD (exit 70) are unchanged.
The runner never invokes the GPU driver. The sampler's episode data will inform
revisiting this advisory policy if admitting work is measured to worsen a stall.

Sampled-holder warnings include bounded provenance from the existing owner state.
Holder identity alone never refuses admission: unresolved, reused, nested, outside,
or unreceipted holders emit `WARN GPU holder check is advisory, not refusing: <reason>`
and admission continues. WSL driver PIDs may not resolve in the Linux namespace.
Admission rests on the declared VRAM budget and fresh owner incident signal.
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
stale-PID removal. An absent, reused, nested or outside holder emits an advisory warning even with
correlated provenance. An empty driver process list produces no holder warning; metadata
never supplies an admission receipt. Malformed metadata fails the owner-state schema check, and unrelated metadata
does not establish holder identity. Sample correlation describes the retained observation, not
proof that an old or paused sample describes the current driver.

These are admission-time checks (`--check-only` and the scope-entry recheck before
command launch), not a continuous Z/D monitor. A cached zombie holder outside an admitted GPU
scope produces an advisory warning; being Z alone does not refuse admission. During
execution, systemd owns resource limits and deadlines. On cleanup, the controller checks
cgroup population and retains locks on unconfirmed cleanup; it does not classify Z/D
processes or automatically kill a workload because of this new dxg observation.
`status` reads slot holders from lslocks and the owner state without taking locks.

`resource-policy.toml` also retains capacity/partition values read by example-repo's
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
The dxg unit fixtures separately exercise host-wide advisory evidence outside admitted scopes;
production has no environment override for its `/proc` inventory.

GPU admission rationale and the dated OSS comparison are documented in [docs/](docs/).
