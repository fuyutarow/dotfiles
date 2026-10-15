+++
schema = 2
name = "relayfix"
outcome = "tools/secrets-push/.changes/relay.md and nothing else is rewritten into the shape the current land parser accepts, so every queued land can proceed; meaning (bump minor, the same entry text) unchanged"
writes = ["tools/secrets-push/.changes/relay.md", "tools/sui-keystore-merge/.changes/merge.md"]
verify = ["bun -e \"import {readFileSync} from 'node:fs'; const t=readFileSync('tools/secrets-push/.changes/relay.md','utf8'); if(!/^---\\nbump: minor\\n---\\n\\n?Relay selected fnox secrets[^\\n]+\\n?$/u.test(t)) process.exit(1)\"", "mise run gate:land"]
timeout_s = 600
premises = ["file:tools/secrets-push/.changes/relay.md"]

[proposition]
id = "RELAY-PARSES"
claim = "relay.md matches the land parser's frontmatter shape with the same bump and entry"
refuted_by = "land still reports 'changesets: FAIL …/relay.md'"
+++

Every `mise run land` fails with "[land] changesets: FAIL /home/fuyu/dotfiles/tools/secrets-push/.changes/relay.md:
expected frontmatter bump and one entry line". The file (landed by another session in d783cb15) is
    bump: minor
    <blank>
    Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.
Rewrite it to exactly:
    ---
    bump: minor
    ---

    Relay selected fnox secrets from local or SSH sources to SSH targets and verify each transfer by SHA-256.
Change nothing else (ticket csschema is making the parser lenient and schema-first). Do not commit or push.

## Current state (coordinator, 2026-10-15 15:50)
relay.md is fixed in this workspace. A scan of every tools/*/.changes/*.md on alpha found exactly one more file the
land parser rejects, from the same commit d783cb15: tools/sui-keystore-merge/.changes/merge.md. Its current bytes:
    bump: minor
    
    Merge fnox-provided Sui keys and aliases into existing target files without replacing prior entries.
Rewrite it into the same frontmatter shape (---, bump line, ---, blank line, the one entry line), keeping the bump
and entry text. Change nothing else; re-run verify.
