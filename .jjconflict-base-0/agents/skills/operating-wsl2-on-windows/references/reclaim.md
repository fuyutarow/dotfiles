# Reclaim — the lever ladder in depth

The SKILL.md table says which lever; this says how each works and the exact host-side procedures.
Split on WHERE the bytes physically are — that decides whether freeing them reaches C: at all.

## Why guest-side freeing does not always reach C:

The ext4.vhdx is sparse. Deleting files inside the guest deallocates blocks, but the vhdx file on
Windows only shrinks when **compacted**. One in-guest discard reached C: live: 127 GB deleted → C:
+105 GB while Running. fstrim was a no-op another time — the blocks were already deallocated. So
guest deletes are worth doing but are NOT a reliable C: lever. The reliable host-side levers are
below.

## The two inert non-levers (do not reach for these expecting space)

| Non-lever | Why it does nothing here |
|---|---|
| `fstrim /` | reports blocks already deallocated as "trimmed"; measured 481 GiB "trimmed", C: +0.9 GB |
| `wsl --manage <d> --set-sparse true` | no-op when the vhdx already has the sparse attribute — it does, because `wslconfig.win` sets `sparseVhd=true` |

Only offline **compaction** returns the logical↔allocated gap. Confirm sparse with
`fsutil sparse queryflag <vhdx>` before assuming set-sparse would help.

## reclaim:host — orphaned swap.vhdx + winget cache (live-safe)

`mise run reclaim:host` (repo: `scripts/reclaim-host.ts`). A fresh distro launch writes a new
`%TEMP%\<guid>\swap.vhdx` and leaves the previous one behind. They accumulate across restarts (three
present, 17 GB orphaned, on one box). READ-ONLY plan by default; `--execute` deletes.

Safe on a live box **by construction**. The running instance holds its swap.vhdx open, so Windows
refuses to delete it (a sharing violation). Even if the newest-is-live heuristic were wrong, the OS
lock is the backstop. It deletes rather than rips, because a graveyard on C: frees no C:.

## reclaim:vhdx — the offline compaction (the ~100GB-class prize)

`mise run reclaim:vhdx` (repo: `scripts/reclaim-vhdx.ts`) is a READ-ONLY PLANNER. It resolves the
vhdx path, measures logical-vs-guest-used, detects the method, and prints the elevated procedure. It
does not run the compaction. That needs admin — an ssh session is not elevated. It also needs a
stopped distro, since `wsl --shutdown` kills every job first. So it is operator-driven, run when the
box is idle.

**Clear the sparse attribute FIRST.** Both compaction paths refuse a sparse vhdx — "Virtual hard
disk files ... must not be sparse" — and this box's vhdx is sparse (`sparseVhd=true`). So after
`wsl --shutdown`, run `wsl --manage <distro> --set-sparse false`, then compact. Re-enabling sparse
is a separate call. Since WSL 2.5.6 `--set-sparse true` is gated behind `--allow-unsafe` and carries
data-corruption reports (microsoft/WSL#13075). Leave it off unless you accept that risk.

Method by Windows edition (each runs after the shutdown + set-sparse-false above):

| Edition | Method | Shape |
|---|---|---|
| Pro / Enterprise (Hyper-V present) | `Optimize-VHD -Path <vhdx> -Mode Full` | one command; admin |
| Home (no Hyper-V) | `diskpart` → `select vdisk` / `attach vdisk readonly` / `compact vdisk` / `detach vdisk` | a diskpart script; admin |

`mise run reclaim:vhdx` prints the full sequence for the detected edition.

## reclaim by RELOCATION — the durable fix when C: is chronically undersized

Compaction only recovers the gap; the vhdx then regrows on the same drive. When C: is simply too
small for the workload, move the whole distro off it instead:

| Lever | What it does |
|---|---|
| `wsl --manage <distro> --move <D:\path>` | relocates the entire vhdx to another drive, after `wsl --shutdown` |
| export → unregister → import to another drive | the manual equivalent where `--move` is unavailable |

`defaultVhdSize` in `.wslconfig` sizes NEW vhdx only — it cannot shrink an existing one.
`wsl --manage <distro> --resize` changes the VHD's MAXIMUM size only, not its allocated bytes. So it
reclaims nothing and is not a reclaim lever.

## reclaim MEMORY — vmmemWSL, not disk

The deny-list diagnoses a real host RAM shortage (row 3); these are the levers once it is confirmed.
All live in `.wslconfig` `[wsl2]` except the last:

| Lever | Effect |
|---|---|
| `memory=<N>GB` | caps the guest so it cannot claim all host RAM (leave the host its headroom) |
| `autoMemoryReclaim=dropCache\|gradual` | returns cached guest memory to Windows over time |
| `swap=0` / `swapfile=<D:\path>` | disables the WSL swap file, or relocates it off C: — also stops swap.vhdx orphans at the root |
| `wsl --shutdown` | releases vmmemWSL immediately (kills running jobs first) |

## Windows-side app bloat — winget

Pre-release browser channels are the usual culprit. Four Edge channels plus Chrome Canary held ~36
GB on one box. Beta/Dev/Canary are developer channels, usually unused. Uninstall with
`winget uninstall --id <Id> --silent` (e.g. `Microsoft.Edge.Beta`, `.Dev`, `.Canary`,
`Google.Chrome.Canary`). `Microsoft.Edge` stable is a Windows component and refuses uninstall.

**Then re-sync the manifest:** `mise run wsl:winget:dump` updates `wsl/winget.win.json`. A later
`wsl:winget:restore` then will not reinstall what you removed. The cleanup becomes a tracked
decision, not a one-off — reclaim that survives in the repo.

## Unused distros

`wsl.exe -l -v` lists them; `wsl.exe --unregister <name>` deletes a distro and its whole vhdx. Check
last use first (the vhdx `LastWriteTime`) — an unused distro is pure reclaim (7 GB from two on one
box). Irreversible: it deletes the Linux disk.

## Order of attack when C: is tight

1. `reclaim:host` — free, live, recurring; no disruption.
2. your own large guest run-data — you know what is disposable; delete it inside the guest.
3. `reclaim:vhdx` — the biggest single lever, but needs an idle box (shutdown).
4. winget bloat + unused distros — Windows-side, direct.
