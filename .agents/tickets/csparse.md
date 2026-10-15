+++
schema = 2
name = "csparse"
outcome = "scripts/land-changesets.ts accepts every changeset shape workers and sessions actually write: frontmatter with or without a blank line before the entry, and a bare `bump: <level>` first line without `---` delimiters followed by an optional blank line and one entry line; it still rejects an unknown bump level, zero or several entry lines, and an entry starting with '-' or '#'"
writes = ["scripts/land-changesets.ts", "scripts/tests/land-changesets.test.ts"]
verify = ["bun test scripts/tests/land-changesets.test.ts", "mise run gate:land"]
timeout_s = 900
premises = ["file:scripts/land-changesets.ts", "file:tools/secrets-push/.changes/relay.md"]

[proposition]
id = "CHANGESET-LENIENT"
claim = "the exact bytes of tools/secrets-push/.changes/relay.md on alpha parse as bump=minor with its one entry line"
refuted_by = "parseChange rejects relay.md's current bytes, or accepts a file with two entry lines or bump: huge"
+++

Live 2026-10-15 15:20: every `mise run land` fails at "[land] changesets: FAIL
/home/fuyu/dotfiles/tools/secrets-push/.changes/relay.md: expected frontmatter bump and one entry line". That file was
landed on alpha by another session (d783cb15) and its bytes are:
    bump: minor
    <blank>
    Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.
A worker wrote the same delimiter-less shape for tools/repo-retrieve/.changes/search-busy.md. Earlier today the parser
also rejected the frontmatter form without a blank line (statusflap) after accepting it before. Six lands are blocked.
Do: make parseChange lenient on layout as stated in outcome (one canonical form remains what the formatter writes);
add tests with the exact relay.md bytes, the no-blank-line frontmatter form, the blank-line form, and the reject cases.
Do not edit relay.md or any other .changes file. Do not commit or push.
