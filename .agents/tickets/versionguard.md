+++
schema = 2
name = "versionguard"
outcome = "workers stop hand-editing tool versions: the source that tells them to edit tools/<name>/CHANGELOG.md or package.json versions is corrected, and gate:land fails a workspace diff that changes a tool's package.json version or CHANGELOG.md, or adds a .changes file not named <slug>.md in the parser's shape, with a message that prints the exact changeset to write"
writes = ["scripts/lint-*.ts", "scripts/tests/lint-*.test.ts", "scripts/tests/version*.test.ts", "mise.toml", "tools/agx/**", "README.md", "tools/*/README.md", "agents/skills/writing-bun-scripts/**", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "mise run gate:land"]
timeout_s = 1800
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

## Current state (coordinator, 2026-10-15 15:30)
Run f5b3a166: the lint and the text fixes are accepted in substance, but the lint compares the workspace tree with the
CURRENT alpha tip. alpha has since received land's own release commits (package.json versions and CHANGELOG entries
written by land), so your gate reports those as hand edits and always fails. Compare against the workspace's fork
point (the merge-base of @ and alpha, i.e. what the worker started from), so only changes made in the workspace count.
Do not touch scripts/land-changesets.ts (ticket csparse owns the parser now). Re-run verify; gate:land must pass.
