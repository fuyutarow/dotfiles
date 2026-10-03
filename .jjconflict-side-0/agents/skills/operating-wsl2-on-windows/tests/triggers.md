# Trigger test set — fire / near-miss no-fire / co-fire (gate F3)

Desk-check after any description edit. ≥5 fire, ≥5 near-miss no-fire. The near-misses are the
adjacent asks that MUST route elsewhere — they prove the cut against `securing-remote-access`.

## FIRES (must trigger this skill)

| # | Ask | Why it fires |
|---|---|---|
| 1 | "my C: drive is full and I run WSL2 — where did the space go?" | GUEST-vs-HOST diagnosis; the core |
| 2 | "the ext4.vhdx is 500 GB and won't shrink after I deleted files" | sparse-vhdx model + compaction lever |
| 3 | "how do I compact the WSL vhdx / reclaim the sparse gap" | reclaim:vhdx, the biggest lever |
| 4 | "swap.vhdx keeps piling up in Temp" | reclaim:host orphan cleanup |
| 5 | "WSL won't start, `wsl -l -v` says Stopped" | lifecycle recovery (idle-terminate → wsl:wake) |
| 6 | "ssh into my WSL box times out after the machine rebooted overnight" | recovery: Running-not-reachable / logon-screen |
| 7 | "vmmemWSL is eating all my RAM and Windows says 0 free" | the free-vs-available memory trap |
| 8 | "guest df says 40% but C: is almost full — how" | the vhdx-max-exceeds-C: corollary |
| 9 | "WSL ate my Windows disk, how do I stop it recurring" | reclaim + the wslconfig storage keys |

## NEAR-MISS NO-FIRE (must route elsewhere — the cut)

| # | Ask | Routes to | Why NOT here |
|---|---|---|---|
| 1 | "how do I set up ssh into my WSL2 box from my Mac" | `securing-remote-access` | ACCESS setup, not operation |
| 2 | "which shell does a Windows ssh session land in — cmd or PowerShell?" | `securing-remote-access` | DefaultShell = access |
| 3 | "install Tailscale on my Windows box" | `securing-remote-access` | reachability setup |
| 4 | "my Linux server's `/` is full" (no Windows/WSL) | plain debugging / `reclaim:*` | no HOST under it |
| 5 | "harden my sshd / rotate keys" | `securing-remote-access` | auth hardening |
| 6 | "set up the WSL keepalive so it stays reachable" | `securing-remote-access` (Setup 4) | prevention CONFIG, not recovery |
| 7 | "reclaim disk on my Mac" | `reclaim:*` directly | no WSL2 |

## CO-FIRE (sequential, not racing)

| With | Order |
|---|---|
| `securing-remote-access` | it stands up + secures the access chain and the keepalive; THEN this operates the running host and recovers it when down. Storage/reclaim/recovery here; access/auth/reachability-config there. |
| `wiring-mise-tasks` | if adding/renaming a `wsl:*` / `reclaim:*` task, that skill owns the task-graph shape; this owns what the task should DO. |

Fire #6 ("ssh into WSL times out after a reboot") lexically overlaps `securing-remote-access`'s broad
"remote access into WSL2" trigger. It co-fires: **recover** the wedged box here (diagnose the layer,
`wsl:wake`), and if the ssh path itself needs re-securing, that is there. Recovery-first is the
default for a post-reboot timeout — the box was reachable before, so it is an operate/recover case.
