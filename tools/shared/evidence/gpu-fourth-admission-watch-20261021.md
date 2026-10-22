> Project identifiers in this historical record have been generalized; consumer paths below are illustrative, not exact retrieval locations.

# GPU fourth admission watch — 2026-10-21

## Scope and result

This is a timestamped, commandless admission snapshot for the handed-off
`ktm-registry` declaration. No workload, GPU utility, slot acquisition,
driver recovery, or background watcher was started.

Result: **ADMIT**.

## Declaration validated read-only

- Handoff file: `/tmp/dotfiles-fourth-gpu-manifest-path.txt`
- Manifest path: `/home/fuyu/.local/state/example-repo-admission/ktm-registry/test.resource.json`
- Installed CLI: `agent-resource-run 1.5.12`
- Declared job: `ktm-registry-parity`
- Declared run class: `test`
- Declared GPU: `gpu_id=0`
- Declared VRAM peak: `4294967296` bytes (4 GiB)
- Declared walltime: `520` seconds

The manifest was supplied by the designated handoff and read as JSON before
the check. Its declaration includes GPU kind `gpu`, eight processes, four CPU
threads, `8589934592` bytes host RAM peak, and `1073741824` bytes scratch.

## First and only probe

- Command: `agent-resource-run --manifest /home/fuyu/.local/state/example-repo-admission/ktm-registry/test.resource.json --check-only`
- Start UTC: `2026-10-21T05:44:05Z`
- Start JST: `2026-10-21T14:44:05+0900`
- End UTC: `2026-10-21T05:44:06Z`
- End JST: `2026-10-21T14:44:06+0900`
- Duration: `1` second
- Exit status: `0`

### stdout

```text
RECOVER_VERDICT verdict=OK age=15s windows_available_mb=4732
ADMIT job=ktm-registry-parity check-only
```

### stderr

```text

```

The `ADMIT` is the command's contemporaneous check-only result, not a claim
of future availability or proof of a workload GPU trial. Because this first
probe admitted the declared request, the retry condition was not met and no
additional probe was run.
