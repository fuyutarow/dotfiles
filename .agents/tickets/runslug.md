+++
schema = 2
name = "runslug"
outcome = "every statusline run row names its worker and dispatcher by human slugs, not UUID fragments: the worker as agt_<ticket> (the agx worker id convention) and the dispatching session by its agent name (e.g. dotfiles-agt_fsyk, from that session's agent-name/custom-title record); a UUID fragment appears only when no name exists, and is marked as such"
writes = ["tools/statusline/**", "tools/agx/**", "tools/shared/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/statusline", "bun test tools/agx", "mise run gate:land"]
timeout_s = 1800
premises = ["file:tools/statusline/src/dispatch-runs.ts", "file:agents/claude/hooks/resolve-agent-name.ts"]

[proposition]
id = "RUN-ROW-SLUGS"
claim = "a run dispatched by session dotfiles-agt_fsyk for ticket versionguard renders as 'agt_versionguard' with dispatcher 'dotfiles-agt_fsyk', not '01a1..b627'"
refuted_by = "a run-row test with a named dispatcher session renders a UUID fragment, or agx ls --json lacks the worker id and dispatcher name fields"
+++

Owner (2026-10-15): "worker display should show the agt_-prefixed slug, not a uuid; was that forgotten?" It was:
the earlier agx contract said "`--name` gives the worker id agt_<name>"; after the agx-next cutover run rows show
e.g.
    luna-high 8m21s $0.08 01a1..b627 versionguard │ working · …
    luna-medium 2m14s $0.39 01a1..7eeb resume: agxroute │ …
where 01a1..b627 is a session id fragment. This session's own identity is "dotfiles-agt_fsyk" (statusline identity
line; Claude Code records it as agent-name/custom-title in the session transcript; agents/claude/hooks/
resolve-agent-name.ts resolves it).
Do:
1. agx records a worker id `agt_<ticket name>` per run (suffix -2, -3 on collisions among live runs) and the
   dispatcher's agent name at dispatch (resolve it the way resolve-agent-name.ts does, from CLAUDE_CODE_SESSION_ID /
   CODEX_SESSION_ID); expose both in `agx ls --json`. Older records without them fall back.
2. statusline run rows show the worker id and the dispatcher name; a fragment only when no name exists, prefixed `#`.
3. Tests for both, including fallback. Probe agx against a temp AGX_NEXT_STATE_DIR. Do not commit or push.
statusflap landed (d59844b6); start from current alpha.

## Current state (coordinator, 2026-10-15 15:50)
Run e5926c49 is accepted in substance (agt_<ticket> worker ids, dispatcher names, statusline rows, fallback). Two
defects block land: (1) versions and CHANGELOGs are hand-edited (agx 4.9.0, statusline 0.16.0): revert
tools/agx and tools/statusline package.json versions and CHANGELOG.md to alpha and add changesets with
`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d) mise run changeset -- <tool> minor "<one line>"` (or by hand:
---, bump: minor, ---, blank, one line); (2) gate:land failed: list the failing checks; fix those caused by your diff
(the VRAM sampler and live PTY/cold-read timeouts are known flaky; report them, do not chase them). Re-run verify.

Owner decision (2026-10-15 16:05): worker display ids are `agt_<slug>`: `_` separates the role field from the slug
field, and the slug is the ticket name normalized to lowercase [a-z0-9-] (any `_`, space or other separator becomes a
single `-`), e.g. ticket `rate_context3` → `agt_rate-context3`. Never a UUID fragment when a ticket name exists.
Parity with the pre-swap agx (CHANGELOG line ~353, removed by 6f93d541 "switch to the five-command CLI"): host-live
uniqueness (a second live run of the same slug gets a suffix), the same id across --continue, and lookup by id in
`agx ls`. Include all three or list which is missing.
Naming survey (soks urn:uuid:01a13e5a-cec2-750e-b4ab-22efac6ddbce): primary sources are silent on a `-`/`_` hierarchy
inside one name except BEM; this repo's rule (`-` joins words, `_` binds a type prefix to its id) is a declared team
convention: cite the urn in the module comment rather than claiming an external standard.
