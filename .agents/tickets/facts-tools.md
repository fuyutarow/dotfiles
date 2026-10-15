+++
schema = 2
name = "facts-tools"
outcome = "a read-only fact sheet, returned in your final agx-return, that lets the coordinator write one small ticket per item below without reading the code itself. For EACH item: the files and functions that would change (path:line), existing tests, the narrowest verify commands, write-set overlap with the other items, and any fact contradicting the item's premise"
writes = []
verify = []
timeout_s = 1500
premises = ["file:tools/disk-reclaim", "file:tools/storage-headroom", "file:scripts/doctor.ts"]
[proposition]
id = "FACTS-TOOLS-SHEET"
claim = "every item in the brief has a row naming path:line loci, covering tests and a narrowest verify command, or an explicit statement that no such locus exists"
refuted_by = "an item with no row, or a locus that does not exist at the --cd revision"
+++

Items (each will become its own ticket):
B1 split tools/disk-reclaim (about 9,850 lines) into independent filters: find (emit candidate records as
   text), check (filter records by policy: staleness, holders, mounts), rm (delete records it is given). Name the
   seams that exist today, which code belongs to each filter, and what the current CLI entry points call.
B2 a dispatch capacity gate: refuse or delay a new `agx run` unit when load1 >= nproc or /tmp inodes are below
   the storage-headroom warn line. Which existing component (storage-headroom hook, agx, a systemd unit) already
   measures these, and where a gate would compose without new state.
B3 self-heal: a stateless systemd user service/timer that, below the /tmp or disk deny line, stops leaking agx
   units' children, runs the existing reclaim commands, and resumes; list the existing commands it would compose.
B4 skill scripts copied into ~/.claude/skills break relative imports (observed: wiring-check.ts imports outside
   its skill dir). List every skill script with an import that leaves its skill directory, and where `mise run
   doctor` could check this.
Read only; do not edit files. Return the sheet as markdown in the final agx-return.
