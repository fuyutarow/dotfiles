# securing-remote-access — forge verification ledger

> Created 2026-09-21 to hold a waiver; this skill predates the ledger convention and its full F3
> artifact is still owed at its next reforge.

## PROSE-DEBT waiver (2026-09-21)

This skill's SKILL.md gained one reciprocal routing row for `driving-git` (a new sibling). The
prose-debt WARNs the floor reports predate that edit and are untouched by it. Waived for this
seam edit; queue position: with the next reforge of this skill, not before.

## 2026-09-22 — §9c added: inbox → winget server swap, and the pending-reboot lockout

Seam edit (one playbook section, one gotcha bullet, one router clause). Every command in §9c was
run end-to-end on r99 (Windows 11 Home 26100) the same day; nothing in it is recalled.

Provenance, one line each:
- Inbox build measured `OpenSSH_9.5p2 for Windows`. winget `Microsoft.OpenSSH.Preview` 10.0.0.0
  installs `OpenSSH-Win64-v10.0.0.0.msi` (GitHub `10.0.0.0p2-Preview`, 2025-10-27). Every
  Win32-OpenSSH GitHub release since v9.8 carries "preview-release (non-production ready)".
- `Remove-WindowsCapability` returned `RestartNeeded=True`. `pending.xml` then held
  `DeleteKeyValue` on `Services\sshd` (ImagePath, ObjectName, DisplayName, Description,
  ErrorControl). `PendingFileRenameOperations` had 172 entries and none touched OpenSSH.
- `pending.xml` also held a staged cumulative-update `Install` of inbox
  `OpenSSH-ServerOnly-Deployment` 10.0.26100.9444. Which op wins at boot is UNVERIFIED — the §9c
  table's last row exists because of it.
- The MSI ships no `install-sshd.ps1`. The five privileges were read with `sc.exe qprivs sshd`
  from the working MSI service before the rename.
- `sc.exe ... binPath= "`"$exe`""` from PowerShell 5.1 produced an UNQUOTED ImagePath;
  `Invoke-CimMethod Win32_Service Change` fixed it (ReturnValue 0, registry shows the quotes).
- 10.0 tree measured: `sshd.exe` (parent services.exe) → `sshd-session.exe -R` →
  `sshd-session.exe -z`; `sshd-auth.exe` is shipped.
- Interop `powershell.exe` launched from WSL could not see `Get-FileHash` until
  `PSModulePath` was pinned to the Machine value; with it, the Dism cmdlets also resolved.
- A SYSTEM startup "guard" task was the first fix considered; the Claude Code auto-mode
  classifier refused it as unauthorized persistence. The rename needs no persistence and was
  chosen by the operator.

PROSE-DEBT: the added lines hold no sentence over 120 characters (floor counts unchanged, below).
The pre-existing WARNs stay under the 2026-09-21 waiver; queue position unchanged.
