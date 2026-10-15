+++
schema = 2
name = "tools-spec"
outcome = "every hand-written specification markdown under tools/ lives in one place, tools/spec/: a cross-tool architecture document (tools/spec/architecture.md) plus one spec per tool, merged from that tool's README.md, contract.md/CONTRACT.md and docs/*.md; every reference in the repo points to the new paths; a lint fails when a hand-written .md appears under tools/ outside tools/spec/, except generated CHANGELOG.md, changeset inputs tools/*/.changes/*.md and declared continuation records"
writes = ["tools/spec/**", "tools/*/README.md", "tools/*/contract.md", "tools/*/CONTRACT.md", "tools/*/docs/**", "tools/*/package.json", "scripts/lint-*.ts", "scripts/tests/lint-*.test.ts", "scripts/config-registry.ts", "**/*.md", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "mise run gate:land"]
timeout_s = 2400
premises = ["file:tools/agx/docs/scope.md", "file:/home/fuyu/Workspace/retrospectives/2026-10-15-dispatch-architecture.md"]

[proposition]
id = "TOOLS-SPEC-ONE-PLACE"
claim = "after the change, `rr files 'tools/**/*.md'` lists hand-written markdown only under tools/spec/ (plus CHANGELOG.md, .changes inputs and tools/disk-reclaim/TASK-CONTINUATION.md); no repo file references a removed path; the new lint fails on a fixture tools/x/NOTES.md and passes on the tree"
refuted_by = "a hand-written .md left outside tools/spec/, a dangling reference to an old path, or a lint that does not fail on the fixture"
+++

Owner decision (2026-10-15): specifications under tools/ are aggregated in tools/spec/. Today 13 hand-written files:
tools/{repo-retrieve,detect-japanese,disk-reclaim,agent-resource-run,statusline,storage-headroom,agx-usehooks,agx}/README.md,
tools/disk-reclaim/CONTRACT.md, tools/agx/contract.md, tools/agx/docs/{scope,next-records}.md.
Keep in place: generated CHANGELOG.md (release rule), tools/*/.changes/*.md (changeset inputs), and
tools/disk-reclaim/TASK-CONTINUATION.md (a canonical continuation record whose locus is bound by its lock/digest
transaction; never move it). Layout: tools/spec/architecture.md (the dispatch pipeline: user stories, components and
the one state owner each, data flow, invariants with enforcement points, negative space; start from the coordinator's
draft at the premise path, written in English like the other specs, keeping every table row), and tools/spec/<tool>.md
per tool (merge README + contract + docs; keep all content; if one tool's spec is long, tools/spec/<tool>/ with an
index is fine). agx's scope table becomes a section of tools/spec/agx.md and architecture.md links to it.
Find references with rr (text and regex for each old path) across the repo, including AGENTS.md, CLAUDE.md, README,
agents/**, skills and package.json "files"; update them. Wire the new lint into the existing lint entry that gate:land
runs without editing mise.toml (ticket land-isolation edits it in parallel); if wiring needs mise.toml, list the exact
lines in your report instead. Ticket jjsafe4 will report a scope row change rather than edit scope.md. Changesets via
`mise run changeset` for any tool whose package.json changes. Do not commit or push.

## Current state (coordinator, 00:27)
The previous run (aca52331) left this workspace with failing verify. Its first failing lines:
(fail) install-mcp: ccc/uv bootstrap > ccc absent: uv tool install runs before any server is touched [5026.24ms]
(fail) install-mcp: root argumentization / defaults > --dotfiles defaults to $DOTFILES env var when the flag is omitted [5017.80ms]
(fail) production Cleye corpus boundary > the declared corpus exactly covers every production Cleye import [534.03ms]
(fail) production Cleye corpus boundary > tools/disk-reclaim/src/reclaim.ts [5091.18ms]
(fail) production Cleye corpus boundary > tools/serena-foreground/src/serena-foreground.ts [5425.33ms]
(fail) production Cleye corpus boundary > agents/skills/governing-research-documentation/scripts/research-docs-check.ts [5012.33ms]
(fail) production Cleye corpus boundary > agents/skills/systematizing-knowledge/scripts/check-donor-set.ts [5007.24ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
