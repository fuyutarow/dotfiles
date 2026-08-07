# Agent resource control

This directory implements the machine floor; it does not own policy. The sole schema and
GPU-first argument live in
`agents/skills/orchestrating-agents/references/measurement-and-resources.md` P7.

`agent-resource-run.ts` is linked to `~/.local/bin/agent-resource-run`. On Linux it reserves a
disjoint CPU set and aggregate RAM/VRAM/scratch headroom. Each admitted command runs in a transient
user-systemd scope with a CPU quota, `MemoryMax`, zero job swap, `OOMPolicy=kill`, and a coarse
thread-aware `TasksMax`. A process-group monitor still enforces the exact declared process count,
walltime, and TERM→KILL cleanup. Finalization also stops and rechecks the whole systemd scope, so a
descendant that creates a new session cannot survive by escaping the monitored process group; an
unverifiable scope cleanup cannot produce `PASS`. Missing user-cgroup enforcement is a denial, not
a monitor-only fallback.

Several declared GPU jobs may share one device: the controller aggregates the declared
`vram_peak_bytes` of the live reservations on that GPU and admits against
`total - max(declared, observed) - safety`, capped at four concurrent jobs per device. The
utilization gate screens unmanaged load only — it is skipped once a reservation is held there, so
an admitted job cannot block the next admission with its own compute. Sharing is only sound
because the budget is pushed into the job: a GPU reservation exports
`JULIA_CUDA_HARD_MEMORY_LIMIT`, `JULIA_CUDA_SOFT_MEMORY_LIMIT`, and `AGENT_RESOURCE_VRAM_BYTES`.
That ceiling is a runtime check, not a cgroup cap — CUDA.jl honours it before every allocation;
other runtimes must honour `AGENT_RESOURCE_VRAM_BYTES` themselves. Scratch remains an admission
reservation only. On WSL2 `nvidia-smi` reports no per-process VRAM, so compliance cannot be
audited after admission.

Smoke check:

```bash
agent-resource-run \
  --manifest "$HOME/dotfiles/agents/resource-control/examples/cpu-smoke.resource.json" \
  --check-only
```

`serena-foreground` uses the same controller for one pinned, project-scoped foreground HTTP
service. It replaces user-global Serena stdio auto-start; it does not restore a global MCP entry.
