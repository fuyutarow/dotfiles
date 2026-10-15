+++
schema = 2
name = "facts-nosync"
outcome = "a read-only partition of the remaining synchronous fs/child_process call sites in this repo's TypeScript into units U45..U(n), returned in your final agx-return as a table: unit id, files (each file in exactly one unit), count of sync calls, and the narrowest test paths covering them; units sized like U01..U44 (1-4 files, under ~40 sync calls), and files already converted by landed no-sync commits excluded"
writes = []
verify = []
timeout_s = 1500
premises = ["file:tools", "file:scripts"]
[proposition]
id = "FACTS-NOSYNC-SHEET"
claim = "every item in the brief has a row naming path:line loci, covering tests and a narrowest verify command, or an explicit statement that no such locus exists"
refuted_by = "an item with no row, or a locus that does not exist at the --cd revision"
+++

Context: commits "no-sync uNN" on alpha converted units U01..U44; some of U01..U44 are still in flight (U01 04 05
08 10 11 14 15 21 23 27 28 31 32 34 and U09 17 22 26 33 40 42 43) — list their files too, so the new units do not
overlap them. Use the repo's no-sync lint rule (read the lint config) as the definition of a sync call.
Read only; do not edit files. Return the table as markdown in the final agx-return.
