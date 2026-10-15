+++
schema = 2
name = "tmpbytesport"
outcome = "the WSL capacity controller reclaims /tmp on BYTE pressure as well as inode pressure, and doctor FAILs when /tmp bytes exceed the threshold, so /tmp can no longer fill to 100% unnoticed"
writes = ["wsl/wsl-capacity-recover.service.wsl", "scripts/wsl-capacity-recover.ts", "scripts/doctor.ts", "tools/disk-reclaim/**", "scripts/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "bun test tools/disk-reclaim", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 1800
premises = ["file:scripts/wsl-capacity-recover.ts"]

[proposition]
id = "TMP-BYTES-WATCHED"
claim = "byte use of /tmp at or above the threshold triggers the same tmpfs reclaim that inode use does"
refuted_by = "a controller test with 100% bytes and 65% inodes triggers no reclaim, or doctor PASSes it"
+++

Live incident (2026-10-14 ~19:20): /tmp tmpfs held 28G of 28G (100%) while inodes were at 65%. The capacity controller
watches only inodes (tmpfsInodeUsage / tmpfsInodeThreshold at 80%), so it never fired. Every Claude session's tool
output broke with ENOSPC.
Largest entries: /tmp/claude-1000 at 8.8G (one firedancer session's scratchpad held 8.0G), /tmp/agx-parity-Iwy5PF at
3.0G, /tmp/.tmp9JYP0z at 3.0G, then many 100–360M probe dirs (wcodex-publish, agx-leasefold-evidence, pdf-tools-sample.*,
lb-factors, gate-land-alpha-bun, plustag-move-home).
Do:
1. Measure byte use with statfs next to inodes, and trigger on max(inode%, byte%) >= threshold.
2. Doctor: FAIL above the threshold for either, with the repair `mise run reclaim:yes`.
3. Check what the tmpfs target treats as reclaimable. If abandoned probe dirs (owner process gone, old mtime) are not
   candidates, say so with evidence and propose the rule. Active Claude session dirs must stay untouchable.
Tests for 1–2. Do not run reclaim on the real machine. Do not commit or push.

Also: the controller (a systemd user service, the reclaim the user already agreed to) must be the path that applies
this reclaim. Interactive sessions must never need to run apply by hand. Two defects found in the live plan
(2026-10-14):
(a) `disk-reclaim plan --target tmpfs` marked /run/user/1000/dbus-1 and /run/user/1000/gnupg as verdict "safe".
    These are live session sockets; they must be "keep". Add a test.
(b) `apply` rejects `--no-progress`, which `plan` accepts. Make the flags consistent.

## Current state (coordinator, 2026-10-15 15:10) — port onto current alpha
The accepted change (run a7ed722d) lives in /home/fuyu/dotfiles-ws-tmpbytes (read it there; do not write it): byte +
inode max trigger in scripts/wsl-capacity-recover.ts, doctor tmpfs-capacity check, dbus-1/gnupg keep and apply
--no-progress in tools/disk-reclaim, tests, wsl/wsl-capacity-recover.service.wsl env rename, changeset
tools/disk-reclaim/.changes/tmpfs-capacity-guard.md. Landing failed at rebase: conflict in scripts/tests/doctor.test.ts
(alpha gained other doctor tests). This workspace starts at current alpha: reproduce the same change here, keep
alpha's tests, re-run verify. Add "wsl/wsl-capacity-recover.service.wsl" to what you touch (it is in writes below).
No jj rebase. Do not commit or push.
