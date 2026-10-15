+++
schema = 2
name = "agxlsfold"
outcome = "agx ls cost is proportional to records appended since the last fold, not to the whole history: a persisted fold snapshot plus a byte offset into the append-only records.jsonl; agx ls --running returns only live runs"
writes = ["tools/agx/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/src/next/store.ts"]

[proposition]
id = "AGXLS-INCREMENTAL"
claim = "a second agx ls after appending k records reads O(k) bytes of records.jsonl and returns the same rows as a full fold"
refuted_by = "a test where the incremental result differs from a full fold, or the second call reads the whole file"
+++

Measured 2026-10-15: `agx ls --json` takes 991 / 1107 / 1817 ms; records.jsonl is 3.6 MB and append-only. Every reader
(statusline, land preflight, coordinator) refolds the whole history.
Do: persist {offset, inode, size, folded state} next to records.jsonl (atomic write); on read, if the inode matches and
size >= offset, fold only the appended bytes; otherwise (rotation, truncation, version change) do a full fold. A
partial last line is not consumed. Liveness checks (process.kill(pid, 0)) still apply at read time. Add `--running`.
Property test: random append sequences, incremental == full fold. Report the measured times before and after.
agxroute landed (015ffb9e); start from current alpha.
Probe against a temp AGX_NEXT_STATE_DIR. Do not commit or push.
