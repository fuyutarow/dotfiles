+++
schema = 2
name = "csschema"
outcome = "the changeset format is one zod-first contract: scripts/changeset.ts owns the schema plus parse and format; a generator task writes changesets so nobody hand-writes them; gate:land validates every tools/*/.changes/*.md with the same schema so a malformed changeset can never reach alpha; land reads through the same module"
writes = ["scripts/changeset.ts", "scripts/land-changesets.ts", "scripts/land.ts", "scripts/tests/changeset*.test.ts", "scripts/tests/land-changesets.test.ts", "scripts/tests/land.test.ts", "scripts/tests/gate-land.test.ts", "mise.toml", "tools/agx/src/next/**", "README.md"]
verify = ["bun test scripts/tests/changeset.test.ts scripts/tests/land-changesets.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/land-changesets.ts", "file:tools/secrets-push/.changes/relay.md"]

[proposition]
id = "CHANGESET-ONE-CONTRACT"
claim = "the generator's output, gate:land's check and land's release read the same zod schema; layout variants (with/without --- delimiters, with/without the blank line) normalize to the same value; a semantically invalid changeset fails gate:land before commit"
refuted_by = "a changeset that gate:land accepts but land rejects (or the reverse), or relay.md's current bytes failing both, or a two-entry-line / unknown-bump file passing gate:land"
+++

Owner (2026-10-15): "if it is parsable it should have been managed zod-first" (/practicing-tiger-style review).
Review findings (coordinator, Tiger record; risk High: one bad file blocked every land five times today):
- scripts/land-changesets.ts:24 validates the whole file with one regex `^---\n(bump: …)\n---\n([^\n]+)\n?$`;
  zod is used only for the bump enum. There is no single contract; writers are humans/workers typing Markdown.
- Nothing checks changesets before they reach alpha: gate:land does not; only land's release step parses them.
  tools/secrets-push/.changes/relay.md (landed by another session, d783cb15) is
      bump: minor
      <blank>
      Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.
  and now blocks every land with "expected frontmatter bump and one entry line". A worker wrote the same shape for
  tools/repo-retrieve/.changes/search-busy.md.
Requirements (implement and test each):
R1 One owner: scripts/changeset.ts exports `ChangesetSchema` (zod: bump enum patch|minor|major, entry: one non-empty
   plain-text line, not starting with - or #), `parseChangeset(text) -> Result<Changeset>` (layout normalization:
   optional `---` delimiters, optional blank line, trailing newline; then schema), and `formatChangeset(c)` (the
   canonical form the repo formatter keeps). land-changesets.ts uses parseChangeset; no regex over the whole file.
   Test: format→parse round-trip equals; the exact relay.md bytes parse to {bump: minor, entry: …}.
R2 Generator: `mise run changeset -- <tool> <patch|minor|major> "<entry>"` writes tools/<tool>/.changes/<slug>.md via
   formatChangeset (slug from the entry, unique). Update the agx worker prompt/brief template text and the README
   release rule to say "run mise run changeset", not "write a file".
R3 Entry boundary: a lint in gate:land parses every tools/*/.changes/*.md with parseChangeset and fails naming the
   file, the reason, and the generator command that writes a correct one. Test: two entry lines, bump: huge, empty
   entry fail the gate; the three layout variants pass.
R4 Containment: land's release step reports the offending file the same way (it can no longer be reached if R3 holds,
   but keep the message).
Ticket versionguard is adding a separate lint for hand-edited versions/CHANGELOGs; do not edit scripts/lint-*.ts it
owns except to add yours as a new file. Do not edit any .changes file. Do not commit or push.

## Current state (coordinator agt_g67e, 2026-10-15 14:50)
Run 097d6bc9 implemented R1-R4. Run 639ed1f7 stopped because tools/secrets-push/.changes/fnox-newline.md is not in this
workspace: it was landed on alpha after the workspace forked (commit 9855eef2). That is expected, not a contradiction;
land rebases. Its exact bytes on alpha are:
    bump: patch
    <blank>
    Remove exactly one output newline from fnox get before verification. Account for fnox stdin set trimming surrounding whitespace and disclose that normalization when it changes the source value; retain SHA-256 mismatch failures for stored byte changes.
Add those bytes as a test fixture (not as a .changes file) and assert they parse. Then update the two existing tests now
in writes (scripts/tests/gate-land.test.ts: gate dependency list including your new lint; scripts/tests/land.test.ts:
the no-blank-line and delimiter-less layouts are valid), run `bun test scripts/tests/land.test.ts
scripts/tests/gate-land.test.ts scripts/tests/changeset.test.ts scripts/tests/land-changesets.test.ts` and
`mise run gate:land`. Change nothing else.
