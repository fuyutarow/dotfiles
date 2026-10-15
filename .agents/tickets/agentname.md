+++
schema = 2
name = "agent-name"
outcome = "agent session names have one declared format, `<project-slug>-<role>_<id>`: the project slug is the directory basename lowercased with every run of characters outside [a-z0-9] (including `_`) turned into one `-` (~/Workspace/polysearch_v1 or polysearch-v1 → polysearch-v1); `<role>_<id>` is a type-id like the worker id agt_<slug> and workspace ws_<slug> (e.g. `polysearch-v1-agt_f24v`); one module formats and parses it and every producer uses it"
writes = ["tools/shared/src/agent-name.ts", "tools/shared/tests/**", "agents/claude/hooks/assign-lib.ts", "agents/claude/hooks/assign-command.ts", "agents/claude/hooks/tests/**", "zsh/aliases.zsh", "zsh/tests/**", "agents/skills/commanding-research-fleets/fleet_policy.toml", "tools/*/.changes/*.md"]
verify = ["bun test tools/shared", "bun test agents/claude/hooks", "mise run test:zsh", "mise run gate:land"]
timeout_s = 1800
premises = ["file:agents/claude/hooks/assign-lib.ts", "file:zsh/aliases.zsh"]

[proposition]
id = "AGENT-NAME-ONE-FORMAT"
claim = "both producers (the assign hook and the zsh claude() wrapper) yield `<project-slug>-<role>_<id>` with a hyphenated project slug and exactly one underscore (between role and id); parse splits at the last `-<role>_` and round-trips format; legacy snake-cased names (agentic_rnd-agt_bvxj) still parse; one shared test-vector table is checked against both the TS module and the zsh wrapper"
refuted_by = "a vector where a producer emits a project segment containing `_`, a name with more than one underscore, TS and zsh outputs that differ, or a legacy name that fails to parse"
+++

Owner decision (2026-10-15, corrected 16:10; this replaces an earlier brief that asked for `<project>_<role>-<id>`, which
was a misreading): `-` joins words, `_` binds a type prefix to its id (agt_<slug>, ws_<slug>, and here <role>_<id>).
Today agents/claude/hooks/assign-lib.ts:51 already emits `${project}-${role}_${suffix}` but snake_cases the project
(`replaceAll("-", "_")`), so polysearch-v1 becomes polysearch_v1-agt_f24v; zsh/aliases.zsh's claude() copies that.
The only change of format: the project slug keeps (and normalizes to) hyphens. The comment there argued one hyphen must
mark the project boundary; the boundary is now the `-<role>_` pattern (role is a lowercase word with no `-` or `_`),
so rewrite that comment accordingly.
This workspace may hold partial edits from the earlier misread brief: revert anything implementing the old format.
Do: run `rr exists 'format or parse an agent session name'` first and reuse what exists. Put format + parse + slug
normalization in tools/shared/src/agent-name.ts; make assign-lib import it; make the zsh wrapper match (pure zsh is
fine; a test feeds it the shared vector table). Consumers that only display or parse names (tools/agx, tools/statusline)
are a follow-up: do not edit them. Changesets via the `mise run changeset` shape. Do not commit or push.
Naming survey (soks urn:uuid:01a13e5a-cec2-750e-b4ab-22efac6ddbce): primary sources are silent on a `-`/`_` hierarchy
inside one name except BEM; this repo's rule (`-` joins words, `_` binds a type prefix to its id) is a declared team
convention: cite the urn in the module comment rather than claiming an external standard.
