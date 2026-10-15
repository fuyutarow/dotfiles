+++
schema = 2
name = "changesetfmt"
outcome = "a changeset in the shape the repo formatter and markdown lint produce (frontmatter, blank line, one entry line) parses at land; and a land that fails after restoring paths into the main checkout leaves the main checkout exactly as it was before land started"
writes = ["scripts/land-changesets.ts", "scripts/land.ts", "scripts/tests/**", "README.md"]
verify = ["bun test scripts/tests/land", "mise run gate:land"]
timeout_s = 1500
premises = ["file:scripts/land-changesets.ts", "file:scripts/land.ts"]

[proposition]
id = "CHANGESET-ROUNDTRIP"
claim = "a changeset written by a worker survives the repo formatter and markdown lint unchanged in meaning and parses at land; a failed land leaves the main checkout clean"
refuted_by = "a fixture changeset passed through the repo's own formatter fails parseChange, or a land that fails at the changesets step leaves modified paths in the main checkout"
+++

Observed (2026-10-15): `mise run land` of workspace tmpbytes failed at
"[land] changesets: FAIL .../tools/disk-reclaim/.changes/tmpfs-capacity-guard.md: expected frontmatter bump and one
entry line". The file was:

    ---
    bump: patch
    ---

    Keep user-session dbus and gnupg paths and accept --no-progress for apply

scripts/land-changesets.ts:24 requires `^---\n(bump: …)\n---\n([^\n]+)\n?$`, i.e. no blank line after the closing
`---`. A second worker (agxspin) independently reported that the valid changeset format conflicts with markdown lint.
So the parser and the formatter/linter disagree, and every land with a changeset is blocked.

Also: that land had already "restored 10 paths" into the main checkout (/home/fuyu/dotfiles) before failing, and left
them there as uncommitted changes. The coordinator restored the checkout by hand.

Do:
1. Find what the formatter / markdown lint require for a `.changes/*.md` file (run them on a fixture). Make the parser
   accept exactly that shape (blank lines between frontmatter and entry; trailing newline), still one entry line,
   still plain text. Add a test that writes a fixture, runs the repo's formatter on it, and parses it.
2. Order land so that validation that can fail (changesets parse, gate) happens before paths are restored into the
   main checkout, or roll the main checkout back on any failure after the restore. Add a test that injects a bad
   changeset and asserts the main checkout is unchanged.
3. Update the changeset rule text in README if it states the shape.
Do not run land on the real repo. Do not commit or push.
