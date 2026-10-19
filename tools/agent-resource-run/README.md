# Agent resource runner

A thin Linux composition of flock and user systemd. The manifest schema lives in
[orchestrating-agents P7](../../agents/skills/orchestrating-agents/references/measurement-and-resources.md).

GPU jobs acquire one of the flock files at
`$XDG_RUNTIME_DIR/agent-resource/slots/gpu.<n>`, with the count from
`resource-policy.toml:gpu_max_concurrent_jobs`. Each acquisition waits at most
`min(900, walltime_seconds)` seconds and returns 75 on timeout. Named Julia compile
slots use the same mechanism and the existing `~/.config/agent-resource/slots.toml`
capacity declaration. No FIFO order is promised.

Every command runs in its own `systemd-run --user --scope --collect` scope with
MemoryMax, MemoryHigh, zero swap, CPUQuota, TasksMax, RuntimeMaxSec and OOMPolicy=kill.
Before launch, the scope child verifies the effective RAM/swap ceiling and pids.peak.
The flock child retains its descriptors until systemd has stopped all descendants.
The runner returns the command's exit status, including scope OOM and walltime kills.
VRAM budget environment variables remain for the firedancer model runner; there is no
VRAM accounting or sampled enforcement.
There is no CPU-set allocator, resource ledger, sampled monitor or peak persistence.

`--manifest`, `--check-only`, `--job-id`, `--slot julia-compile` and `status`
retain their invocation forms. DENY is 69, recovery HOLD is 70, flock timeout is 75.
The inherited admission receipt and its digest remain available to polysearch's gate;
each scope exposes its own cgroup v2 pids.peak. CPU_IDS is compatibility metadata,
not exclusive affinity. Thread-count environment variables remain bounded.

A GPU-specific refusal requires unresponsiveSince in the shared gpu-owner.json.
It names the evidence and recorded GPU-holding pids with their commands. Missing or
stale samples do not deny admission. The runner never invokes the GPU driver.
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
