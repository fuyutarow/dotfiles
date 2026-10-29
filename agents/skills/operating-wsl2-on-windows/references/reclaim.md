# Reclaim — the lever ladder in depth

The SKILL.md table says which lever; this says how each works and the exact host-side procedures.
Split on WHERE the bytes physically are — that decides whether freeing them reaches C: at all.

## Why guest-side freeing does not always reach C:

On a sparse ext4.vhdx, deleting guest files and discarding unused blocks can return host allocation
without shrinking the logical file length. On r99, 2026-10-12 delete + fstrim moved C: free
20.1 → 34.7 GiB immediately, then 31.9 GiB 30 minutes later. Evidence:
`~/dotfiles/.agent-state/tasks/u26-cache-reclaim/` — `c-before.txt`, `c-immediate.txt`,
`c-30min.txt`, `fstrim.txt`, and `reclaim-report.json`. Concurrent cleanup and live jobs confound
causal attribution: this demonstrates a live C: return, not that every byte came from fstrim.
Measure C: before, immediately after, and later; neither guest `df` nor trim's reported bytes
establish host reclaim. If discard returns little, consider offline compaction.

## Discard and sparse settings — measure rather than assume

| Operation | Limit |
|---|---|
| `fstrim /` | can return sparse allocation live after deletion; an earlier 481 GiB "trimmed" moved C: only +0.9 GB; judge by C: delta |
| `wsl --manage <d> --set-sparse true` | no-op when the vhdx already has the sparse attribute — it does, because `wslconfig.win` sets `sparseVhd=true` |

Offline **compaction** is another way to reclaim unused allocation. Confirm sparse with
`fsutil sparse queryflag <vhdx>` before assuming set-sparse would help.

## Host cleanup — separate Windows cleanup tiers over SSH

`disk-reclaim plan host` reports candidates without deleting. A fresh distro launch writes a new
`%TEMP%\<guid>\swap.vhdx` and leaves the previous one behind. They accumulate across restarts (three
present, 17 GB orphaned, on one box). READ-ONLY plan from macOS or WSL; `--host` defaults to `r99`.
`disk-reclaim run host --yes` runs eligible swap, winget, temp files older than 1 day, Delivery Optimization, WER/dumps and slow DISM cleanup. Recycle Bin and hibernation require `--approve recycle-bin` / `--approve hibernate-off`. Each lever reports C: free delta; near-zero is "inert here". VHDX allocation/distro/state are report-only; guest `system` cleanup remains optional and separate.

Safe on a live box **by construction**. The running instance holds its swap.vhdx open, so Windows
refuses to delete it (a sharing violation). Even if the newest-is-live heuristic were wrong, the OS
lock is the backstop. It deletes rather than rips, because a graveyard on C: frees no C:.

## Windows restore point / VSS shadow storage

File scans can miss this allocation. Inspect elevated `vssadmin list shadowstorage` and
`vssadmin list shadows /for=C:`; check the storage volume as well as the protected volume.
The owner's 2026-10-12 r99 output reported 14.8 GB allocated and a shadow created
2026-10-11 19:00:10, type `ClientAccessibleWriters`. That is an incident anchor, not a fixed
size threshold. `disk-reclaim plan --on windows` reports allocated storage as ASK, never applies it.
Deleting a shadow is irreversible and requires the owner. The owner can cap growth with
`vssadmin resize shadowstorage /for=C: /on=C: /maxsize=<owner-chosen-cap>`; shrinking the cap
can remove snapshots too ([Microsoft command reference](https://learn.microsoft.com/windows-server/administration/windows-commands/vssadmin-resize-shadowstorage)).

## VHDX — the offline compaction (the ~100GB-class prize)

`disk-reclaim plan vhdx`, run from WSL, is a READ-ONLY PLANNER. It resolves the
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

`disk-reclaim plan vhdx` prints the sequence for the detected edition; it does not compact.

## Reading a damaged or sparse VHDX read-only

Native attach is not a universal recovery reader. r99's 2026-10-12
`Mount-DiskImage -Access ReadOnly` refused the sparse source: "Virtual hard disk files must be
uncompressed and unencrypted and must not be sparse" (`/mnt/e/wsl/u24/native-source-attach-v10.json`
and `copy-verify-v10.json`, read via `ssh r99-u26`). The hand-repaired source then failed
`wsl --mount --vhd --bare` with `Wsl/Service/AttachDisk/MountDisk/HCS/ERROR_FILE_CORRUPT`
before any guest device appeared (`native-blocker-v11.json`). This failure does not prove that
every repaired VHDX is unreadable.

For this source, `qemu-nbd --read-only` over the qcow2 overlay exposed a readable device;
`source-nbd-v12.log` records the connection, `source-device-baseline-v12.json` reports `ro=1`,
and `source-refused-write-v12.txt` records `dd: IO error: Permission denied`. Preserve the source,
verify the exported device is read-only, and mount ext4 with `ro,noload` to avoid journal replay.
A healthy destination VHDX can be attached natively with `wsl --mount --vhd <destination> --bare`:
the owner's session attached the destination as `/dev/sde`; `commands-v12.jsonl` records successful
mount and read-only fsck of that device. That attach command alone does **not** enforce read-only
access. Distinguish source corruption and sparse-attribute refusals from the destination's result.

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

1. `disk-reclaim plan host`, then `disk-reclaim run host --yes` for eligible live cleanup.
2. Your own large guest run-data — identify disposable data; `rip` moves it to the graveyard and does not immediately free disk space. `mise run disk:free -- SIZE` frees eligible graveyard payloads now, preserving the undo window.
3. `disk-reclaim plan vhdx` — plan only; offline compaction needs an idle box (shutdown).
4. winget bloat + unused distros — Windows-side, direct.
