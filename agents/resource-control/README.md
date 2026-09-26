# Agent resource control

This directory implements the machine floor; it does not own policy. The sole schema and
GPU-first argument live in
`agents/skills/orchestrating-agents/references/measurement-and-resources.md` P7.

`agent-resource-run.ts` is the package `bin` `agent-resource-run` (installed into `~/.bun/bin` by
`bun link` via dotfiles `mise run deps`). On Linux it reserves a
disjoint CPU set and aggregate RAM/VRAM/scratch headroom. Each admitted command runs in a transient
user-systemd scope with a CPU quota, `MemoryHigh` and `MemoryMax` both set to the exact declared
RAM envelope (no runner-added margin on either — 2026-09-04, see `agent-resource-run.test.ts`'s
"no runner-added margin" test), zero job swap, `OOMPolicy=kill`, and a coarse thread-aware
`TasksMax`. This only covers commands actually launched through this file's own `buildSystemdLaunch`
— a job started via a hand-typed `systemd-run --user --unit=<name> …` (the sanctioned durability
pattern for outliving a session) bypasses this entirely; that is a distinct, known coverage gap,
not something this tool can see or enforce. A process-group monitor still enforces the exact declared process count,
walltime, and TERM→KILL cleanup. Finalization also stops and rechecks the whole systemd scope, so a
descendant that creates a new session cannot survive by escaping the monitored process group; an
unverifiable scope cleanup cannot produce `PASS`. Missing user-cgroup enforcement is a denial, not
a monitor-only fallback.

**Investigating an unattributed `agent-resource-*.scope` OOM-kill?** `agent-resource-run.test.ts`
deliberately triggers a real kernel OOM-kill against a real systemd scope as one test's passing
condition (2026-09-04, mistaken for live-dispatch harm twice in one evening). Check whether
`bun test agents/resource-control/` ran around that time before assuming the kill came from a real
dispatch — see that test's own comment for the incident history.

Several declared GPU jobs may share one device: the controller aggregates the declared
`vram_peak_bytes` of the live reservations on that GPU and admits against
`total - max(declared, observed) - safety`, capped at four concurrent jobs per device. The
utilization gate screens unmanaged load only — it is skipped once a reservation is held there, so
an admitted job cannot block the next admission with its own compute. Sharing is only sound
because the budget is pushed into the job: a GPU reservation exports
`JULIA_CUDA_HARD_MEMORY_LIMIT`, `JULIA_CUDA_SOFT_MEMORY_LIMIT`, and `AGENT_RESOURCE_VRAM_BYTES`.
That ceiling is a runtime check, not a cgroup cap — CUDA.jl honours it before every allocation;
other runtimes must honour `AGENT_RESOURCE_VRAM_BYTES` themselves. Scratch remains an admission
reservation only. On WSL2 `nvidia-smi` reports no per-process VRAM (`--query-compute-apps` lists
PIDs but its `used_memory` column reads literal `[N/A]`), so compliance cannot be audited after
admission, and the measured `vram_peak_measured_bytes` below is simply absent there — not a bug
in this runner, a WSL2 driver-passthrough limitation.

## Measured peak, on release

The manifest's `host_ram_peak_bytes`/`vram_peak_bytes` are what the job *declared*; a `RELEASE`
line — printed once per run, whether the job passed or breached, right before the systemd scope
is torn down — reports what it *measured*: `ram_peak_measured_bytes` (preferring the scope's own
cgroup `MemoryPeak`, kernel-tracked and unaffected by the monitor's own polling interval; falling
back to the highest `/proc` RSS the monitor sampled when cgroup accounting is unavailable —
`ram_peak_source` says which) and, for a `gpu` job, `vram_peak_measured_bytes` sampled from
`nvidia-smi --query-compute-apps` once a second and cross-referenced against the job's own PIDs
(omitted on WSL2, see above, or on any host without `nvidia-smi`). The same fields are written as
JSON to `<manifest path>.peak.json`, so a caller can read its own job's measured peak without
capturing stdout at all; that file is overwritten per run, like every other piece of this
runner's per-run state.

## Child admission receipt

For an executing command, the runner reads the manifest as bytes, resolves its absolute path, and
computes `AGENT_RESOURCE_MANIFEST_SHA256` itself. Only after it has written the live reservation
does it replace (rather than inherit) every `AGENT_RESOURCE_*` admission/resource key with the
admitted values. Before constructing that environment, it rejects any lease whose CPU count, RAM,
scratch, or device differs from the admitted manifest, so the runner-owned resource variables and
the receipt always describe the same reservation. This includes a fresh
`AGENT_RESOURCE_ADMISSION_ID`, the random `AGENT_RESOURCE_RESERVATION_ID`, the canonical absolute
manifest path, and
`AGENT_RESOURCE_ADMISSION_RECEIPT`: compact canonical JSON containing the manifest digest, job,
reservation, deterministic systemd scope unit, controller PID, CPU IDs, RAM, scratch, device, and
reservation start time. `AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256` is the SHA-256 digest of those
exact UTF-8 JSON bytes. The execution-only `ADMIT` line includes the admission ID, reservation ID,
scope unit, manifest digest, and receipt digest for correlation; `--check-only` does not create a
receipt.

A cooperating child should (1) hash the receipt bytes and compare it with the receipt digest, (2)
parse it and require its manifest path/digest fields to equal the corresponding environment
values, (3) hash `AGENT_RESOURCE_MANIFEST_PATH` and compare it with
`AGENT_RESOURCE_MANIFEST_SHA256`, and (4) require `/proc/self/cgroup` to contain its `scope_unit`
as a complete slash-delimited component. `verifyAdmissionReceipt` implements steps 1 and 4 for Bun
consumers, and additionally rejects unknown fields, non-schema-1 receipts, invalid field types,
non-canonical JSON, non-absolute manifest paths, and malformed SHA-256 strings.
The reservation file remains the controller's existing live-state record and is removed during
lease cleanup; there is deliberately no durable receipt file.

This is cooperative local provenance, not cryptographic attestation: an untrusted same-UID process
can forge environment variables, receipt JSON, or another user scope. It does establish that a
cooperating child launched by this runner has a byte-bound manifest receipt and is currently in the
runner's scope; it does not establish a remote or adversary-resistant launcher identity.

The Linux receipt integration test uses the task-owned outer envelope at
`agents/resource-control/examples/resource-runner-tests.resource.json`: it grants three CPUs so
the inner two-CPU reservation can retain the controller's one-CPU safety reserve, and it reserves
768 MiB for the inner 512 MiB scope plus the outer Bun test runner/controller. The inner receipt
job is the separate two-CPU manifest at
`agents/resource-control/examples/resource-runner-receipt-inner.resource.json`. The test writes
the runner-child environment and receipt to its temporary state directory, confirms verification
inside the runner scope, then reuses that exact environment in a direct child and requires
verification to fail because its cgroup does not contain the receipt's scope component.

Smoke check:

```bash
agent-resource-run \
  --manifest "$HOME/dotfiles/agents/resource-control/examples/cpu-smoke.resource.json" \
  --check-only
```

## Named resource classes, without copying the manifest per ticket

`decideAdmission` refuses two live reservations under the same `job_id`, and `job_id` is a field
*inside* the manifest — so running several concurrent tickets from one resource shape (say, a
"cpu-8g" class) used to force a fresh copy of the file per ticket just to give each one a unique
identity (reported live 2026-09-26: 20+ per-ticket copies of one template piling up under one
fleet's envelope directory). `--job-id <id>` overrides the manifest's own `job_id` at invocation
time — through `validateJobId`, the exact same filesystem-safety rule the manifest field itself is
checked against — so one shared template file per class is enough:

```bash
agent-resource-run --manifest cpu-8g.resource.json --job-id firedancer-ticket-42 -- <command>
```

The manifest's own `job_id` still works unmodified when `--job-id` is omitted. The admission
receipt's `manifest_sha256` is still the shared template's own bytes, unaffected by the override —
it proves "this declared envelope shape," while the receipt's separate `job_id` field is what
distinguishes concurrent tickets sharing that shape.

`serena-foreground` uses the same controller for one pinned, project-scoped foreground HTTP
service. It replaces user-global Serena stdio auto-start; it does not restore a global MCP entry.
