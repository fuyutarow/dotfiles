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

A GPU-specific refusal uses live read-only `/proc/<tgid>/stat`,
`/proc/<tgid>/task/<tid>/stat`, and `wchan` evidence, independent of
`gpu-owner.json` being paused, stale, or missing `unresponsiveSince`. Every visible
numeric thread-group entry and its numeric task entries are inspected, including work
outside admitted scopes. A D-state leader waiting in dxg retains the PID diagnostic. A
distinct D-state task waiting in dxg refuses with its TGID, TID, revalidated leader and
task states, wait channel, and leader/task evidence paths; this distinguishes a zombie
leader from a live blocked task. An unreadable, empty, or zero wait channel for a task
still in D state fails closed. The task state and its start-time identity are rechecked
after reading its wait channel, and the thread-group identity is rechecked before a
refusal: an exited, woken, or reused task/TGID does not establish a live stall.
Unreadable inventory/stat, malformed stat, or a task inventory that remains unavailable
for a live thread group fails closed. A known non-dxg wait does not itself refuse GPU
admission. This admission snapshot does not prove future driver health or prevent a
stall that begins after the check.

Recorded `unresponsiveSince` still refuses admission and names recorded GPU-holding
PIDs and commands. Missing owner/capacity data also refuses admission; sample age or
paused status alone does not. Existing holder-scope and declared VRAM checks remain.
The runner never invokes the GPU driver.

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
