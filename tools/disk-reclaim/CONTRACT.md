# Process-use contract

Process evidence is scoped to the owner's uid. Only a process whose uid equals
the uid being checked can make a candidate `KEEP` or `ASK`; every other uid,
including root, is skipped. This applies to all targets and the approved-delete
path. The earlier root-process and private-ancestor exception does not apply.

The reason for this scope is: "all agents and workers run as the owner's uid;
foreign-uid daemons do not use user scratch or workspaces (owner decision
2026-10-08)".

For a same-uid process, a readable cwd or fd under the candidate is positive use
and yields `KEEP`. On `EACCES`, the scan rechecks process starttime once: a
vanished or reused pid is treated as gone; a still-live process whose readable
comm is in `ignore_unreadable_procs` is ignored; otherwise the result is
unknown and yields `ASK`. EACCES from exactly named systemd, sudo, su, and polkitd
processes with revalidated identity is expected and excluded from uncertainty;
readable positive paths still yield `KEEP`. Other unreadable processes remain
unknown, including in approved-delete.

If the process table itself cannot be listed, the scan remains unknown because
it cannot establish that same-uid processes were examined. Unit tests may set
`RECLAIM_UNIT_PROC_ROOT`; normal target and delete scans use `/proc`.

# CLI CONTRACT — progress and diagnostics

## C0 CONSUMERS

- Consumer regimes: human-interactive, shell-pipeline, ci, agent

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| Terminal owner | Preview or authorized run | `plan`, `run --yes` | `--json` |
| Pipe, CI, agent | Same commands without terminal redraws | No new prompts | One `reclaim.plan/1` document |

## C1 INVOCATION

- Parser profile: existing strict Cleye grammar, flags before or after targets.
- Ambiguous / invalid cases: unknown flags/targets and unauthorized run exit 2; help exits 0.

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| `disk-reclaim plan [TARGET...] [--verbose] [--no-progress] [--json]` | Existing selection | Unused | `disk-reclaim plan toolchains` |
| `disk-reclaim run TARGET... --yes [--verbose]` | Existing ordered actions | Explicit interactive purge only | `--help` |

## C2 EFFECTS

- Effects / recovery: presentation does not authorize deletion or change verdicts.

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| Progress | Run retains every safety check | Completed actions and receipts remain durable | SIGINT 130 / SIGTERM 143 finalize the region |
| Diagnostics | Group failures; exclude expected revalidated permission boundaries | Positive use yields KEEP; unexpected missing idle evidence yields ASK | `--verbose` exposes original facts |

## C3 CHANNELS

- Machine mode: `--json`.
- Machine framing: one unchanged JSON document on stdout.
- Machine compatibility: existing `reclaim.plan/1` fields and values remain unchanged.
- Waits / liveness: scans identify their target; SSH identifies host/probe or lever (120-second probe bound, one-hour DISM bound); lock waits identify the holder (default 900 seconds); deletion reports counters and ETA when total/rate are known. TTY refresh is 100 ms; plain refresh is two seconds plus completion. Synchronous probes announce their scan before blocking and redraw when they yield.

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| Both streams on a TTY | Candidate and summary tables | Shared Clack taskLog groups | Concurrent target/host-lever rows, collapsed completion lines |
| CI, pipe, TERM=dumb, JSON | Plain table or JSON | Plain progress/diagnostics | No escapes; `--no-progress` suppresses progress |

## C4 OUTCOMES

- Fallbacks / handoffs: unavailable targets remain SKIP. Expected revalidated EACCES permission boundaries are not probe problems and do not make in-use evidence unknown; readable use and all other safety checks still apply. Workspace rows show allocated bytes regardless of verdict, or unknown bytes if sizing fails.

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| Preview | 0 | Verdicts and summary | Review ASK candidates |
| Partial failure | 1 | Existing results/receipts | Review before retry |
| Usage/engine failure | 2 | Diagnostic after progress | Repair cause |
| Lock / unavailable explicit run | 3 / 4 | Holder / SKIP reason | Retry later / repair availability |
| Interrupted | 130 / 143 | Finalized progress | Review durable receipts |

## C5 EVOLUTION

- Positive receipt: real Mac `plan system toolchains` reports the default Rust toolchain KEEP and WSL-only system maintenance SKIP, exit 0.
- Negative receipt: PTY duplicate-candidate fixture finalizes the region before its engine diagnostic; unauthorized run remains exit 2.

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| JSON | Stable schema and values | No schema change | `tests/progress-cli.test.ts` |
| Human layout | TTY-only redraw, stderr progress | Layout may evolve | Fake-clock screen and real PTY tests |
| Counts | Scan traversal entries while discovering; summary counts candidates; delete counts filesystem entries | Found bytes are estimates; overlapping candidates can double-count | Existing model and fixtures |
