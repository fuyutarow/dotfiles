+++
schema = 2
name = "statusline-tmpfs"
outcome = "the statusline Sys line shows tmpfs headroom next to the disks, e.g. `tmp 26.5GiB free · inodes 99% free`, for /tmp (and any tmpfs the storage-headroom config names): free bytes AND free inodes, because /tmp exhausted on inodes (1,048,576) on 2026-10-15 while bytes were 3% used; the inode (and byte) figure turns yellow at the storage-headroom hook's tmpfs warn line and red at its deny line (today 85% / 95% inode use), read from the hook's config at render time, never copied; the recover unit's 80% start-of-reclaim trigger is a different concept and is not used for colour; measured with statfs (no subprocess), never blocking a render"
writes = ["tools/statusline/src/storage.ts", "tools/statusline/src/host-load.ts", "tools/statusline/src/ansi.ts", "tools/statusline/tests/**", "tools/storage-headroom/src/decision.ts", "tools/storage-headroom/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/statusline", "mise run lint:ts"]
timeout_s = 1800
premises = ["file:tools/statusline/src/storage.ts", "file:agents/hooks/storage-headroom.toml"]

[proposition]
id = "STATUSLINE-TMPFS"
claim = "fixture statfs readings render a tmp segment with free bytes and free inode percent; inode use above the tmpfs warn threshold renders yellow, above deny red; a statfs failure renders `tmp n/a (<why>)`, never a crash or a blank"
refuted_by = "a render without the tmp segment on a host with /tmp as tmpfs, or inode exhaustion that renders green"
+++

Owner request 2026-10-15: "ここに tmpfs の余裕も表示させるようにして" (on the Sys line beside Disk C: / Disk WSL).
Facts: drives come from agents/hooks/storage-headroom.toml via STORAGE_CONFIG (storage.ts:24); diskSegment in storage.ts
renders them; the recover unit's tmpfs threshold is TMPFS_RECLAIM_PERCENT=80 (wsl/wsl-capacity-recover.service.wsl).
If the threshold has no single readable home, read the hook's tmp config and note the duplication in your return; do not
edit agents/hooks/storage-headroom.toml (ticket self-heal owns it now). Another ticket (recover-health) adds a recoverer
health segment in tools/statusline: keep your change inside the files listed in writes. Do not commit or push.

## Current state (coordinator — single current version)
Accepted on substance. Land's rebase onto alpha conflicted with herdr-btm 43e6cca2 (which also edited the statusline's
measurement). The coordinator rebased this workspace onto alpha; jj reports 2-sided conflicts in
tools/statusline/src/host-load.ts, tools/statusline/src/storage.ts and tools/statusline/tests/golden/state-15.json.
Resolve them by meaning (edit the files; do not run jj): keep alpha's btm reporting and your tmpfs segment. Regenerate
the golden only through the test's own update path. Do not rebase. Record `mise run hook:pre-commit` exit code and last
line in the checks field of your JSON return.

