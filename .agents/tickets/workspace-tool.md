+++
schema = 2
name = "workspace-tool"
outcome = "a standalone repo-agnostic tool tools/workspace (package bin `ws`, installed by bun link like rr and agx) owns the run-workspace lifecycle: `ws add <slug> [--rev R] [--repo P]` creates `<repo parent>/<repo>.ws/ws_<slug>` (jj workspace name = dir name) and runs the repo's declared readiness command; `ws rm <slug>` forgets and rips it, refusing on an unlanded change; `ws gc [--dry-run]` collects only terminal lineages with no live pid and no unlanded change; it keeps no state of its own"
writes = ["tools/workspace/**", "tools/spec/workspace.md", "package.json", "bun.lock", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/workspace", "mise run gate:land"]
timeout_s = 3600
premises = ["file:tools/agx/docs/scope.md"]

[proposition]
id = "WS-ONE-OWNER-NO-STATE"
claim = "fixtures show: add creates the declared path and runs the readiness command; rm refuses with an unlanded change; gc collects exactly the terminal lineages with no live pid and no unlanded change (judged from the recorded run-end commit id) and nothing else, refusing when RIP_GRAVEYARD is RAM-backed; the tool writes no state file; every verb fails before work when its precondition is unmet"
refuted_by = "a fixture where gc collects a live, continuing or unlanded workspace, rm loses an unlanded change, or the tool writes a state file"
+++

Why (2026-10-15): the 10-14 cutover moved workspaces out of agx (right) but named a primitive (`jj workspace`) as
owner, so nobody owned the contract: today ~60 hand-made workspaces here and 140 (15 GB) in coralbase. This tool is
that owner; agx consumes trees via `--cd` and ws reads agx records (`agx ls --json`) for gc: they compose by data and
by names (worker agt_<slug>, workspace ws_<slug>), never by a shared ledger.
Contract details: repo readiness comes from a small repo-owned config file the tool reads (dotfiles declares
`mise trust -q` + `bun install --frozen-lockfile`; choose the file name and say it); one flock per backing store;
foreground and loud on failure; never kills jj; rm/gc use rip and refuse when RIP_GRAVEYARD is tmpfs/ramfs; legacy
dirs (~/dotfiles-ws-*, ~/dotfiles-arm-agx-*, ~/Workspace/*-arm-*) are reported by `gc --dry-run` as unrecorded and
collected only with `--include-unrecorded` and no diff. Reuse the workspace code already written in
/home/fuyu/dotfiles-ws-jjsafe4 (tools/shared/src/jj-workspace.ts, workspace-policy.ts; read it, do not write there).
Spec goes in tools/spec/workspace.md (ticket tools-spec is aggregating tool docs into tools/spec/ in parallel; do not
add a README under tools/workspace). Do not edit tools/agx/docs/scope.md; give the row change in your report. Never
run gc on the real home except --dry-run. Changesets via `mise run changeset`. Do not commit or push.

## Current state (coordinator, 01:0x — single current version)
Your change was accepted; land's preflight refused: package bin check failed: tools/workspace/src/ws.ts: target is not executable. Make the bin target executable the way other tools' bins are (look at another tools/*/package.json bin and its file mode), then run `mise run lint:ts`, `mise run lint:bun` and the package bin check.
Ignore config-map findings on zero-byte sandbox placeholder files. Everything else in your change stays. Test data outside the workspace. Do not commit or push.
