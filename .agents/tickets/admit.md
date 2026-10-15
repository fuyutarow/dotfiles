+++
schema = 2
name = "admit"
outcome = "a small stateless filter `admit` (tools/admit, package bin) decides which tickets may start now: input = ticket paths (args or stdin, one per line); output = the subset to start now, one path per line on stdout, and one stderr line per held ticket with its reason; it reads only current facts: load1 vs nproc, free memory, /tmp inode headroom from the storage-headroom config, the number of this host's active agx units, each ticket's optional `[resources]` declaration (cpu, mem_gib, tmp_inodes), and whether the ticket's latest run is already accepted and landed (alpha contains its landed commit) or currently running (then it is held with that reason); it never starts anything (the caller pipes its output to the launcher) and writes no state"
writes = ["tools/admit/**", "package.json", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/admit", "mise run lint:ts", "mise run lint:bun"]
timeout_s = 2400
premises = ["file:tools/spec/architecture.md", "file:agents/hooks/storage-headroom.toml"]

[proposition]
id = "ADMIT-FILTER"
claim = "fixtures: with load1 above the cap every ticket is held with reason `load`; a ticket whose latest run is running is held `running`; a ticket whose accepted run is in alpha is held `landed`; a ticket whose [resources] exceed free memory is held `mem`; otherwise it is printed; admit writes no file and spawns no agx"
refuted_by = "admit printing a landed or running ticket, holding without a reason on stderr, or writing state"
+++

Architecture R7 (tools/spec/architecture.md, I15: admission, and the coordinator must respect machine capacity). Today the
coordinator's private script (~/.cache/coord/bin/dispatch-queue.ts) does this inside a launcher loop and re-launched an
already-landed ticket (nosync-u27). Unix: one job (decide), filter shape, no state; the launcher stays separate. Read agx's
records via `agx ls --json` (a subprocess is fine here) and alpha via jj. If a package bin is added, follow the repo rule
(package.json bin via `bun link`). Test data outside the workspace. Do not commit or push.

## Current state (coordinator, 09:0x — single current version)
Your run stopped correctly on a contradiction in the brief. Coordinator decision: "writes no state" means admit
itself writes no file; reading agx's records through `agx ls --json` is allowed even though agx maintains its own fold
cache (that is agx's state, owned by agx). Implement the outcome as written with that reading.
Test data outside the workspace. Do not commit or push.
