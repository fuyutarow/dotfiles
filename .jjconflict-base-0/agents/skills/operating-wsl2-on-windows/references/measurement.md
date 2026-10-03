# Measurement — the deny-list in full, and the two-leg audit

The SKILL.md table is the checklist; this is why each row is load-bearing and how the audit encodes
the fix. Every reading here was confidently wrong on a real box before it was corrected.

## Why a guest-only view is the failure mode

Three outages on one box were all invisible from inside the guest:

| Outage | Guest said | Host truth |
|---|---|---|
| C: hit 1.08 MB free | `/` 38% used | vhdx max 1007 GB > C: 931 GB, so the guest filled C: |
| 7 spinning host procs held 6.8/16 cores 3 days | loadavg + PSI flat | vCPUs starved from outside |
| a service crash-looped every 8s for 3 days | nothing | Windows event log counted ~29,000 |

So the audit always reads **both halves**. A leg that returns nothing is reported unreachable, never
as healthy zeros. "I could not see" and "I saw a problem" are different answers.

## The deny-list rows, in full

| # | The lie | The mechanism | The correct read |
|---|---|---|---|
| 1 | vhdx `Get-Item.Length` = disk used | sparse file: Length is the **logical** high-water mark (540 GB logical vs 430 GB allocated on one file) | `du -B1 -s <vhdx>` = allocated; logical only sizes the cap |
| 2 | `du`/recurse of `AppData\Local` | `Application Data` is a **junction → Local**; naive recursion loops (647 GB phantom) | stat the vhdx as ONE file; exclude `Packages` and reparse points |
| 3 | `FreePhysicalMemory` = free RAM | Windows caches aggressively, drives free≈0 by design (read 0.2 GB while 4.5 GB was available) | `AvailableMBytes`, sampled; a real shortage forces **hard page reads/s** |
| 4 | one CPU or PSI sample | `LoadPercentage` is a cached point value; swung 4→87% on a steady box; PSI `avg10` is a 10s window that tracks the workload | CPU = mean of ≥3 samples; PSI judged on **avg300**, avg10 shown for "why is it slow right now" |
| 5 | `pgscan` total = reclaiming now | `/proc/vmstat` counters are cumulative since boot; a gate on the total opens once and never closes | sample as a **rate**; total 8.3M with rate 0 is history, not pressure |
| 6 | `fstrim` "N GiB trimmed" | reports blocks already deallocated; measured 481 GiB "trimmed", C: moved +0.9 GB | trust only the **C: free delta** |
| 7 | memory PSI as an alarm | on WSL2 `autoMemoryReclaim=dropCache` drops cache → refaults → PSI, at tens of GB free | PSI is a diagnostic, not an alarm; a real shortage shows in MemAvailable or swap |

## The measured anchors

Each threshold's measured anchor lives as a comment beside its constant in `scripts/wsl-audit.ts`
(e.g. the CPU-sample spread, the PSI windows, the vhdx logical-vs-allocated gap). Read them there,
not here — one source of truth, and it cannot drift from the code it governs.

## The audit that encodes all of this

`mise run wsl:audit` (`scripts/wsl-audit.ts`) runs two independent legs — GUEST and HOST — local or
over an ssh alias. It applies every fix above — du for the vhdx, sampled CPU/PSI, AvailableMBytes, a
junction-safe stat. Exit 0 clear / 1 threshold / 2 unreachable; `--json` for machine use. Thresholds are anchored to what the
box actually did, never round numbers — the source comments carry each anchor. It is the runnable
form of this deny-list. Read it before asserting a cause, and extend its thresholds rather than
eyeball a one-off PowerShell number.
