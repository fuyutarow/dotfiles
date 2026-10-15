+++
schema = 2
name = "facts-agx"
outcome = "a read-only fact sheet, returned in your final agx-return, that lets the coordinator write one small ticket per item below without reading the code itself. For EACH item: the files and functions that would change (path:line), the existing tests that cover them, the narrowest verify commands (bun test paths, mise tasks) that exercise them, other items that would touch the same functions (write-set overlap), and any fact that contradicts the item's premise"
writes = []
verify = []
timeout_s = 1500
premises = ["file:tools/agx/src", "file:tools/agx/docs/scope.md"]
[proposition]
id = "FACTS-AGX-SHEET"
claim = "every item in the brief has a row naming path:line loci, covering tests and a narrowest verify command, or an explicit statement that no such locus exists"
refuted_by = "an item with no row, or a locus that does not exist at the --cd revision"
+++

Read tools/agx/docs/scope.md first. Items (each will become its own ticket; keep them separable):
A1 at run end, agx removes the zero-byte placeholder files the Claude Code sandbox leaves in the worktree
   (.bash_profile .bashrc .claude/{agents,commands,hooks,launch.json,loop.md,output-styles,routines,
   scheduled_tasks.json,skills,workflows} .gitconfig .gitmodules .idea .profile .ripgreprc .zprofile .zshrc),
   only when they are zero-byte and were absent before the run.
A2 a run whose marker pid is dead and has no ended record is folded as outcome=lost by `agx ls`, and the next
   `agx run` appends the ended record (the statusline shows 44 such "stale" runs today).
A3 provenance on the started record: verbatim ticket copy + sha256, the --cd commit id, resolved premise ids.
A4 agx fails loudly (non-zero, message naming the path) when its state dir is unreadable, or empty while the
   caller expects history (observed: a repo's mise env set XDG_STATE_HOME and `agx ls` printed []).
A5 per-ticket budget override for the claude route (today a fixed $2 in agents/models/dispatch-roster.toml
   [claude_run] max_budget_usd truncates long tickets).
A6 land (scripts/land.ts) accepts a workspace whose superseded/rejected lineage is followed by an accepted run
   of a successor ticket (observed: ticket renamed agentname -> agent-name blocked land).
A7 claude-route runs emit progress events the statusline can show (today: "$– no event yet" for claude rows
   while codex rows show cost, last command, files).
Read only; do not edit files. Return the sheet as markdown in the final agx-return.
