---
name: operating-wsl2-on-windows
description: >-
  Operate WSL2 as a headless compute host on Windows — diagnose why C: fills
  while the guest looks healthy, reclaim host disk by the right lever, and
  recover the box when it wedges on its own resources or lifecycle. Use for C:
  ドライブが満杯 / WSL が Windows の C: を食い潰す / Windows disk exhausted by WSL,
  ext4.vhdx or swap.vhdx growth, sparse vhdx won't shrink, offline compaction /
  wsl --shutdown / Optimize-VHD / diskpart compact, vmmemWSL memory, and the
  measurement traps that make host numbers lie. Also WSL2 lifecycle recovery —
  distro Stopped / idle-terminated / WSL won't start / ssh into WSL times out
  after a reboot / stuck at the logon screen. NOT for setting up or securing the
  ssh/Tailscale access itself (→ securing-remote-access, which owns the chain and
  the .wslconfig reachability keys): this skill operates a box already reachable,
  or one wedged on its own disk or lifecycle. Trigger even on a bare "my C: is
  full and I run WSL", "WSL disk won't shrink", or "WSL box unreachable after
  reboot".
---

# Operating WSL2 as a compute host on Windows

English skill; respond in the user's language (default Japanese). Keep **GUEST**, **HOST**, **sparse
vhdx**, **lever**, **allocated vs logical** as identifiers.

## THE LAW

> WSL2's disk is a **sparse ext4.vhdx whose maximum exceeds C: itself**. So the GUEST can fill the
> Windows drive while looking half-empty, and the HOST's own gauges lie the other way. Three rules
> follow. **Measure both halves, never one. Reclaim by WHERE the bytes physically are, not where
> they look. Read every host number as a distribution, not a reading.** Every rule below is one of
> those three, made checkable. The counterfeit each time is a confident number that was never what
> it seemed. This skill exists because that counterfeit is the default.

## The one model that reorganizes everything — GUEST vs HOST

Two disks, and the guest cannot see the one that runs out.

| | GUEST (inside WSL) | HOST (Windows C:) |
|---|---|---|
| What `df` / Task Manager shows | `/` usage inside the distro | C: free |
| The file underneath | one sparse `ext4.vhdx` | that vhdx + pagefile + Windows + apps |
| The trap | vhdx MAX (often ~1 TB) can exceed C:, so guest at 40% can still fill C: | a full C: wedges the guest with **no guest-side error** |

**Corollary that drives everything:** freeing bytes *inside* the guest does not reliably reach C:.
The vhdx is sparse; only an offline compaction shrinks it. So diagnosis and reclaim both split on
**which disk** — a guest-only view is the failure mode, not the tool.

## Deny-list — the host numbers that lie (each cost a wrong call; verify, do not trust)

Every row was a confident-wrong reading on a real box. The right column is the fix, greppable.

| Reading | Why it lies | Do instead |
|---|---|---|
| `Get-Item.Length` on a vhdx as "disk used" | sparse file: **logical** high-water, not allocated | `du -B1 -s <vhdx>` for allocated; logical only for the cap |
| `du -sh` walking `AppData\Local` | the `Application Data` **junction loops back to Local** → double/∞ count | stat the vhdx as ONE file; exclude `Packages`/junctions |
| `FreePhysicalMemory` as "free RAM" | Windows drives free≈0 by design (caches) | `AvailableMBytes`; a shortage shows as **hard page reads/s**, not the gauge |
| one `LoadPercentage` / PSI `avg10` sample | instantaneous, swings wildly | mean of ≥3 samples; PSI judge on **avg300**, show avg10 |
| `pgscan` total as "reclaiming now" | cumulative since boot — never decreases | sample it as a **rate**; a nonzero total with zero rate is history |
| `fstrim` "N GiB trimmed" as reclaim | reports blocks already deallocated — a no-op here | trust only the **C: free delta**; if it doesn't move, fstrim did nothing |
| `wsl --manage --set-sparse true` as reclaim | no-op if already sparse; and gated behind `--allow-unsafe` since WSL 2.5.6 (corruption reports) | verify per box with `fsutil sparse queryflag`; only **compaction** returns the gap, after clearing sparse first |

The runnable form of this table is `mise run wsl:audit`. It reads both halves with these fixes
applied: sampled, junction-safe, allocated-by-du. Read it before asserting a cause. Full detail and
the measured anchors: `references/measurement.md`.

## Reclaim — pick the lever by WHERE the bytes are, largest first

There is no single "clean up WSL". The bytes live in four different places, each with its own lever.

| Bytes live in… | Lever (mise task) | Reclaims | Frees C: how |
|---|---|---|---|
| guest package/build caches | `reclaim:clean`, `reclaim:builds`, `reclaim:system` | GB–tens | only if the vhdx later compacts |
| the vhdx's sparse gap (logical ≫ used) | `reclaim:vhdx` (planner → offline compact) | **the biggest**, ~100GB-class | directly, after `wsl --shutdown` |
| orphaned `swap.vhdx` (dead distro instances) | `reclaim:host` | tens of GB, recurring | directly, live-safe (OS locks the live one) |
| Windows-side app bloat | winget uninstall + `wsl:winget:dump` | tens of GB | directly |
| an unused distro | `wsl.exe --unregister <name>` | its whole vhdx | directly |
| C: is simply too small | relocate: `wsl --manage <distro> --move <D:\path>` | **the whole vhdx**, durable | moves it off C: entirely |

Memory (vmmemWSL) is a different axis. Its levers — `memory=`, `autoMemoryReclaim`, `swap=0`,
`wsl --shutdown` — are in `references/reclaim.md`.

Attack largest-reachable-first. `reclaim:host` is free and live; `reclaim:vhdx` is the prize but
needs an idle box. The full order, the Home-vs-Pro method split, and the winget/prune commands:
`references/reclaim.md`.

## Recover — the box is unreachable, decide which layer is down

`ssh <guest>` failing is usually NOT the network. Locate the layer before touching anything.

| Symptom | Layer that is down | Fix |
|---|---|---|
| host ssh works, `wsl -l -v` shows **Stopped** | distro idle-terminated | `mise run wsl:wake` |
| distro **Running** but `ssh <guest>` times out | ssh.service inside WSL never started | `wsl:wake` (it starts sshd via the host) |
| host itself unreachable, box was rebooted | Windows at the logon screen, Tailscale (a GUI client) down | reach host over the **LAN** alias; `wsl:wake` tries it first |
| LAN alias won't resolve | you are off the box's subnet | tailnet alias; unattended Tailscale removes this whole row |
| C: was full, everything wedged | HOST disk exhaustion, not a WSL bug | reclaim C: first (above), then `wsl:wake` |

`mise run wsl:wake` encodes this: LAN route then tailnet route, wake if Stopped, then verify the
guest. It starts sshd when the guest is silent — Running is not reachable. Root causes and the
unattended-Tailscale fix: `references/lifecycle.md`.

## MUST-NOT-FIRE

| Ask | Route |
|---|---|
| setting up ssh/Tailscale INTO a WSL box, DefaultShell, remote editors | `securing-remote-access` |
| a Linux-only disk/memory question with no Windows host under it | ordinary debugging; no skill |
| "reclaim my Mac/Linux disk" (no WSL2/Windows) | `reclaim:*` tasks directly, or plain cleanup |
| securing/hardening/exposing the SSH server | `securing-remote-access` |
| the box is healthy and I'm configuring the standing keepalive/.wslconfig | `securing-remote-access` (Setup 4) |

## Fire / no-fire

Fires on a full C: under WSL, a vhdx that won't shrink, swap.vhdx growth, a Stopped distro, or
vmmemWSL pressure. Does not fire on setting up or hardening the ssh/Tailscale access, or on a Linux
disk with no Windows host. The full set — 9 fire, 7 near-miss no-fire, 2 co-fire — is
`tests/triggers.md`.

## Routing — the one sibling cut

| Sibling | Cut (runtime-answerable) |
|---|---|
| `securing-remote-access` | **Cut:** setting up or securing the way IN — ssh, keys, Tailscale, DefaultShell, `.wslconfig` reachability → there; the box already reachable or WEDGED ON ITS OWN disk/lifecycle → here. **Order:** that skill stands the chain up, then this keeps the host alive. **Keys:** reachability theirs; storage (`swap`, `sparseVhd`, vhdx cap) here. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/measurement.md` | every deny-list row in full, the measured anchors, the `wsl:audit` two-leg design and its thresholds | asserting a cause; a host number looks wrong |
| `references/reclaim.md` | the lever ladder in depth, offline compaction (Optimize-VHD vs diskpart), winget bloat, distro prune, why fstrim/set-sparse are inert | freeing C:; choosing a reclaim lever |
| `references/lifecycle.md` | idle-terminate, the logon-screen / onlogon trap, wsl:wake's two routes + sshd-ensure, unattended Tailscale | the box is down or keeps going unreachable |
