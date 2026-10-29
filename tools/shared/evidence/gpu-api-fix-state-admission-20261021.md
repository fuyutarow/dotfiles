# GPU API-fix-state admission snapshot

Status: **UNKNOWN — not observed (supplied manifest unavailable)**

## Scope and distinction

This record was created at `2026-10-21T11:25:36Z`, before reading the supplied
manifest or invoking the runner. It was reserved for exactly one fresh,
commandless `agent-resource-run --manifest … --check-only` admission snapshot.

It is not a reproduction of the historical `api-fix-state` refusal. The
original has no retained manifest path, raw streams, PID/TID, or timestamp and
is unreconstructable from the supplied evidence.

No GPU workload, probe, sampler, `nvidia-smi`/NVML, CUDA/Julia command,
signal, stop, restart, reset, recovery, allocation, or retry was performed.
No admission command was invoked.

## Declared request

- Supplied manifest path:
  `/home/fuyu/Workspace/firedancer.ws/ws_api-fix-state/packages_next/FireOps.jl/modules/keyed_tm/test/existing.resource.json`
- Intended command (confirmed from installed CLI help, but **not run**):
  `agent-resource-run --manifest "$manifest" --check-only`
- Intended time limit: 30 seconds.
- Invocation working directory, PID, argv, start/end time, stdout, stderr, and
  exit status: not applicable because the runner was not invoked.

## Blocking observation

The first read attempt of the supplied path returned exit `1` with this exact
diagnostic:

```text
sha256sum: /home/fuyu/Workspace/firedancer.ws/ws_api-fix-state/packages_next/FireOps.jl/modules/keyed_tm/test/existing.resource.json: No such file or directory
```

Because the target cannot be read, no manifest bytes, copy, SHA-256, or
resource classification can be retained. Substituting a manifest, inventing
budgets, or retrying against another path would change the declared request,
so it was not done.

## Runner identity readback

- Invocation found at: `/home/fuyu/.bun/bin/agent-resource-run`
- Resolved source: `/home/fuyu/dotfiles/tools/agent-resource-run/src/agent-resource-run.ts`
- Installed version: `agent-resource-run 1.5.12`
- Confirmed check-only grammar from `agent-resource-run --help`:
  `agent-resource-run [flags...] [command...]`, with `--manifest <string>` and
  `--check-only` flags.

## Interpretation and boundary

This is an **UNKNOWN** result, not ADMIT or DENY. It establishes neither GPU
admission nor driver health, and says nothing about the cause of the historical
refusal. No named refusing PID/TID was emitted; the caller PID must not be
treated as an offending identity. Therefore no `/proc` inspection was
performed.

## Required next action

The coordinator must supply a presently readable path to the same declared
manifest (or explicitly replace the declared request). Only then can a new,
single, bounded commandless admission observation be performed.

