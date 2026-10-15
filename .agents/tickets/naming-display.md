+++
schema = 2
name = "naming-display"
outcome = "the agt_/ws_ naming convention is visible wherever runs are shown: the convention (tools/spec/workspace.md 'Layout and naming': workspace dir and jj name ws_<slug>, agx worker agt_<slug>) is followed by dispatch (systemd units agt_<slug>, workspaces ws_<slug>) but no display shows these names; the statusline's run rows (tools/statusline/src/dispatch-runs.ts) show for each run its worker name agt_<slug> and its workspace ws_<slug> (or the legacy directory name), taken from the run record, not guessed from the ticket name; agx records the worker name: the systemd unit name when run under one (INVOCATION_ID / the unit from /proc/self/cgroup), else agt_<ticket>; this is a REDO of run 34f7bf94 (runslug, unlanded, conflicts with current alpha in tools/agx/src/next/{run.ts,store.ts}, tools/agx/tests/next/run.test.ts, tools/statusline/src/dispatch-runs.ts); its patch is at /home/fuyu/.cache/coord/triage/runslug.patch for reference"
writes = ["tools/agx/src/next/**", "tools/agx/tests/**", "tools/statusline/src/dispatch-runs.ts", "tools/statusline/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests/next", "bun test tools/statusline", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2700
premises = ["file:tools/statusline/src/dispatch-runs.ts", "file:tools/agx/src/next/store.ts", "file:tools/spec/workspace.md"]

[proposition]
id = "NAMING-DISPLAY"
claim = "`agx ls --json` records carry worker (agt_<slug>) and workspace name; a statusline golden shows a run row with both names; a run started under `systemd-run --unit=agt_x` records worker agt_x; a run in dotfiles.ws/ws_y shows ws_y; live probe: the workspace's own statusline entry rendered against the real agx state shows the names of currently running workers"
refuted_by = "a run row without both names, or a worker name derived from the ticket while a unit name exists"
+++

Another ticket (statusline-agx-sticky) is changing how statusline fields render when reads are slow; keep your statusline
change inside dispatch-runs.ts and its tests. Add no sync calls. Do not rebase; land rebases. Record `mise run
hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the workspace. Do not
commit or push.

## Current state (coordinator — single current version)
Your stop was right: btmp is not where agx worker rows come from. Decision: agx workers run as systemd units, not herdr
panes, so herdr has no row for them; herdr's Claude rows already carry session names such as dotfiles-agt_g67e. Scope is
now agx records + the statusline run rows only; leave herdr untouched.

