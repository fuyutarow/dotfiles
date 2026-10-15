+++
schema = 2
name = "fnoxfix"
outcome = "tools/secrets-push/.changes/fnox-newline.md and nothing else is rewritten into the frontmatter shape the current land parser accepts, keeping bump patch and the entry text"
writes = ["tools/secrets-push/.changes/fnox-newline.md"]
verify = ["mise run gate:land"]
timeout_s = 600
premises = ["file:tools/secrets-push/.changes/fnox-newline.md"]

[proposition]
id = "FNOX-PARSES"
claim = "fnox-newline.md is exactly: ---, bump: patch, ---, blank line, the unchanged entry line"
refuted_by = "land still reports 'changesets: FAIL …/fnox-newline.md'"
+++

Every land fails with "[land] changesets: FAIL /home/fuyu/dotfiles/tools/secrets-push/.changes/fnox-newline.md:
expected frontmatter bump and one entry line" (landed by another session in 9855eef2). Its bytes are
`bump: patch`, a blank line, and one entry line. Rewrite it to:
    ---
    bump: patch
    ---

    <the same entry line, unchanged>
Change nothing else (ticket csschema makes the parser lenient and schema-first). Do not commit or push.
