# CLI contract

## C0 Consumers

The supported consumers are the terminal owner, shell pipelines, CI, and agent callers. Planning
is read-only. Destructive work requires records on stdin or the explicit `--yes` composition.

## C1 Invocation

```text
disk-reclaim
disk-reclaim plan [--on <host>] [--target <target>...]
disk-reclaim apply [--approve <owner-item>...]
disk-reclaim --yes [--on <host>] [--target <target>...]
```

`disk-reclaim` alone renders a human plan. `plan` writes JSONL candidate records. `apply` reads
only stdin records. `--yes` plans and applies the generated records in one process. The host
selector `--on windows` selects the Windows host target. Existing explicit `run`, `delete`,
`targets`, `receipts`, and `wrap` commands remain available for their existing consumers.

## C2 Effects

Each input record is parsed independently. Apply accepts `safe` records and an `ask` record only
when it names an owner item explicitly approved with `--approve`. It rechecks the fingerprint,
acquires one host lock, re-plans the specific target path, and invokes that target's action once.
Missing records are never discovered by apply. A replaced path or a target that is no longer safe
is skipped. A failed record does not authorize another path.

## C3 Channels

Plan JSONL stdout has one JSON object per candidate with `target`, `host`, `path`,
`bytes_allocated`, `regen`, `holders`, `verdict`, `reason`, and `fingerprint` (`dev`, `ino`,
`size`, `mtime`). Windows host rows use the lever id as `target`, carry allocated `SizeOnDisk`
bytes (the pagefile uses Windows `Win32_PageFileUsage` allocation accounting), and set
`fingerprint` to null because the Windows path cannot be fingerprinted locally.
Apply skips records without a local fingerprint. Progress uses the shared Clack adapter on a TTY
and is silent off-TTY; JSONL data is not decorated. Errors and named wait diagnostics go to stderr.
A failed or empty SSH/PowerShell host probe exits 2 with the failing step and captured stdout and
stderr. Probe, SSH, lock, fstrim, and host sampling waits have explicit bounds.

## C4 Outcomes

Exit 0 means the plan or all selected actions completed. Exit 1 means at least one selected action
failed. Exit 2 means invalid invocation or plan/apply setup failure. Skipped ASK, KEEP, DENY, or
fingerprint-changed records do not run.
When a deletion run is cancelled, stderr reports `cancelled during deletion` and each
successfully deleted path as `deleted before cancellation: <path>`.

A timer run stopped by SIGTERM exits 143; SIGINT exits 130. It writes a receipt
containing the items completed before the signal before exiting.

On WSL, apply runs `fstrim` with a 120-second bound and samples `/mnt/c` for up to 10 seconds.
The report keeps guest free-space delta separate from measured Windows C: free-space delta.

## C5 Evolution and receipts

The flat JSONL fields and verdict vocabulary are the pipeline interface. Human progress is a
presentation layer and cannot change those records. `tools/disk-reclaim/tests/records.test.ts`,
`records-cli.test.ts`, host-return tests, and the shared terminal-progress tests provide positive
and negative receipts for stdin scope, fingerprint changes, owner approval, and channel behavior.

## `disk` family parser

The additive `disk` entry accepts the effect-oriented `plan`, `move`, `free`, and `inspect`
grammar shown by their help. `inspect receipts` reads the existing receipt history in a bounded
child process, reports malformed or unreadable history as unknown, and does not write state.
`free targets vhdx` and `free targets audit` explicitly refuse these plan-only targets without
starting an action; mixed selections report the remaining unavailable targets as unknown.
Single-target `clean`, `rust`, `builds`, `toolchains`, and `mise-configs` actions are enabled; per-target details are linked from `README.md`.
The builds adapter uses the legacy planner and rechecks each candidate and fingerprint under
the common lock; protected, in-use, and other-target-owned paths are kept. Each action reports
its own statfs measurements; a non-positive available-space change is partial. Unsupported
action adapters produce one
`disk.result/1` JSON object with outcome `unknown` and exit 4 before any operation. Invalid
syntax or invalid legacy JSONL input exits 2 on stderr without a result. Help and version exit 0.
`free records` alone reads stdin; it requires at least one valid legacy candidate record.
Selectors are exclusive, repeatable target and approval values must be distinct, and `--` ends
options. Unspecified scope and observations remain null. Counts describe selected item rows.
Sizes are rounded up to bytes and durations are bounded safe integers.
The legacy `disk-reclaim` interface retains its existing contract.
