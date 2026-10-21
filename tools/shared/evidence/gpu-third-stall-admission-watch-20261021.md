# GPU third-stall admission watch — 2026-10-21

## Result

**ADMIT** — one current, commandless admission check succeeded. This is a momentary
health/capacity snapshot only; it is neither a GPU trial nor a promise of future
availability. No workload command, GPU probe, slot acquisition, retry, timer, or
background watch was started.

## Declared request

- Handoff file: `/tmp/dotfiles-third-gpu-check-manifest-path.txt`
- Manifest: `/home/fuyu/.local/state/firedancer-admission/ctw-impl/gpu.resource.json`
- Manifest SHA-256: `8372e7d68c12b5174dce0dcefb2953bfdfd9cda02c92c51108bb374ec63502b3`
- Structural read-only validation: schema `1`; job `ctw-impl-gpu`; GPU `0`;
  declared VRAM peak `2147483648` bytes; `child_fanout` `0`; walltime `240` seconds.
- The request's VRAM is taken solely from the declared manifest. No reservation was
  inferred from the unrelated 64 KiB parity payload.

## Installed checker

- Path: `/home/fuyu/dotfiles/tools/agent-resource-run/src/agent-resource-run.ts`
- Version: `agent-resource-run 1.5.12`
- Invocation (with no workload command):
  `agent-resource-run --manifest /home/fuyu/.local/state/firedancer-admission/ctw-impl/gpu.resource.json --check-only`

## Attempt receipt

| Attempt | Start UTC | End UTC | End JST | Duration | Exit |
| --- | --- | --- | --- | ---: | ---: |
| 1 | 2026-10-21T04:52:53Z | 2026-10-21T04:52:53Z | 2026-10-21T13:52:53+0900 | 411 ms | 0 |

Complete runner diagnostic:

```text
RECOVER_VERDICT verdict=OK age=16s windows_available_mb=18348
ADMIT job=ctw-impl-gpu check-only
```

The runner itself parsed and admitted the actual manifest during this commandless
check. Admission was not inferred from cached paused/low-VRAM fields. Because the
first check admitted, the bounded watch stopped after one attempt; no backoff or
retry rule was invoked.
