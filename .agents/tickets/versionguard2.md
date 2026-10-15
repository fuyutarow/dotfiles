+++
schema = 2
name = "versionguard2"
outcome = "workers stop hand-editing tool versions: the source that tells them to edit tools/<name>/CHANGELOG.md or package.json versions is corrected, and gate:land fails a workspace diff that changes a tool's package.json version or CHANGELOG.md, or adds a .changes file not named <slug>.md in the parser's shape, with a message that prints the exact changeset to write"
writes = ["README.md", "scripts/lint-*.ts", "scripts/tests/lint-*.test.ts", "scripts/tests/version*.test.ts", "mise.toml", "tools/agx/**", "README.md", "tools/*/README.md", "agents/skills/writing-bun-scripts/**", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "mise run gate:land"]
timeout_s = 3600
premises = ["file:scripts/land-changesets.ts", "rev:422d20d31f9e"]

[proposition]
id = "NO-HAND-VERSIONS"
claim = "a workspace that edits tools/<x>/package.json version or tools/<x>/CHANGELOG.md fails gate:land with the changeset it should have written; a correct changeset passes"
refuted_by = "a fixture diff with a hand-edited CHANGELOG or version passes gate:land, or a correctly shaped changeset fails it"
+++

Observed 2026-10-15: five workers (agxroute, cccgpu, cccplan, cccoom, gitlock) hand-edited tools/<x>/CHANGELOG.md
and/or package.json "version" or wrote `.changes/1.4.2.md` / `.changes/1.4.3.md`, although since d53e2858 land owns
versions: tickets add tools/<name>/.changes/<slug>.md and land applies the bump and writes CHANGELOG. Each cost a
rejection round trip; two blocked lands (conflict in CHANGELOG.md; "expected frontmatter bump and one entry line").
Do:
1. Find, with rr, every text a worker reads that still prescribes editing CHANGELOG/version (README release rule,
   tools/*/README.md, skill bodies such as writing-bun-scripts, agx worker prompt/brief templates in tools/agx). Fix it
   to the changeset rule; quote each before/after in the report.
2. Add a lint (wired into gate:land) over the workspace diff vs alpha: fail on a changed "version" in
   tools/*/package.json or any change to tools/*/CHANGELOG.md, and on a .changes file whose name looks like a version
   or whose content does not parse with scripts/land-changesets.ts' parser. The message prints a ready changeset:
       ---
       bump: <patch|minor|major>
       ---

       <one plain-text entry line>
   land itself (which writes them) must keep working: the lint runs on the workspace diff, not on land's release
   commit.
3. Tests for pass and fail cases. Do not commit or push.

## Current state (coordinator, 00:15)
The previous run (1309b252) left this workspace with failing verify. Its first failing lines:
(fail) install-mcp: add failure aborts (set -e parity) > a failed claude add stops the run before any later (alphabetical) server registers [147.12ms]
(fail) install-mcp: add failure aborts (set -e parity) > the aborting command's OWN exit code propagates verbatim, never collapsed to 1 [139.68ms]
(fail) install-mcp: ccc/uv bootstrap > ccc absent: uv tool install runs before any server is touched [266.44ms]
(fail) install-mcp: ccc/uv bootstrap > missing uv skips its named server and continues registering other servers [100.73ms]
(fail) install-mcp: drift report > no drift: nothing printed when live registrations exactly match .mcp.json [175.64ms]
(fail) install-mcp: drift report > drift: a live registration absent from .mcp.json is reported, not removed, by default [275.82ms]
(fail) install-mcp: drift report > junk lines in `claude mcp list` (headers, bracketed sections) are not mistaken for names [110.29ms]
(fail) install-mcp: drift report > a pathological `claude mcp list` line with an empty captured name (sed parity) is not silently dropped [88.03ms]
(fail) install-mcp: drift report > MCP_PRUNE=1 removes undeclared registrations from both claude and codex [102.64ms]
(fail) install-mcp: --dry-run > performs zero mutating calls and prefixes every planned action with [dry-run] [84.87ms]
Continue from the workspace as it stands: fix these without disabling rules, re-run verify. A failure in
"stale consumer link" is a known pre-existing test failure owned by another ticket; ignore only that one.
config-map findings on zero-byte sandbox placeholder files (.claude/launch.json and peers) are removed by the
coordinator before land; ignore only those. Test data outside the workspace. Do not commit or push.
