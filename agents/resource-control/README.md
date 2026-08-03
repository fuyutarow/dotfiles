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
a monitor-only fallback. VRAM and scratch remain admission reservations rather than kernel hard
limits.

Smoke check:

```bash
agent-resource-run \
  --manifest "$HOME/dotfiles/agents/resource-control/examples/cpu-smoke.resource.json" \
  --check-only
```

`serena-foreground` uses the same controller for one pinned, project-scoped foreground HTTP
service. It replaces user-global Serena stdio auto-start; it does not restore a global MCP entry.
