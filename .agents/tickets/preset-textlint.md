+++
schema = 2
name = "preset-textlint"
outcome = "presets/textlint/ is the single home of the textlint/prose project configuration that is buried in skills today (textlintrc*.json and prh-*.yml (today in linting-prose/assets/)): each config becomes a file under presets/textlint/ listed in presets/textlint/preset.toml (the manifest contract of presets-generic: name, description, files = [{ source, destination }], optional check = [commands]); `mise run preset -- apply textlint --to <repo>` writes them and `diff` reports drift; the skill text that held the config now states the rule briefly and links to presets/textlint/<file> instead of carrying a copy; a fixture under presets/tests/fixtures/textlint/ proves the preset applies to an empty repo"
writes = ["presets/textlint/**", "presets/tests/fixtures/textlint/**", "presets/tests/*.test.ts", "agents/skills/linting-prose/**", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test presets", "mise run lint:ts", "mise run lint:bun", "mise run typecheck", "mise run lint:md"]
timeout_s = 2400
premises = ["file:presets/README.md", "file:presets/src/cli.ts"]

[proposition]
id = "PRESET-TEXTLINT"
claim = "every textlint/prose row of the facts-presets inventory is either moved into presets/textlint/ (and the skill links there) or listed in the return with the reason it stays (an example of a rule, not a config to copy); `mise run preset -- list` shows textlint; apply on an empty temp repo then diff exits 0"
refuted_by = "a textlint/prose config left duplicated in a skill without a reason, or a preset that does not apply cleanly"
+++

Owner (2026-10-16): presets/ holds config presets per project kind (uv, cargo, julia, ts, …) because those assets are
buried in skills. The manifest-driven CLI landed (presets-generic 4ec3d74d). Inventory (read it first): the rows with
ecosystem `textlint/prose` in /home/fuyu/.cache/coord/facts-presets-findings.md (base revision 6f21acb0; each row has path:line).
Keep the values the skill already prescribes (do not invent settings). A skill keeps its reasoning and rules; only
copy-pasteable config moves. Do not run `mise run skills:sync`.
You cannot rebase in the sandbox (the shared jj store is read-only there); land rebases. lint:no-sync is on alpha:
add no synchronous fs/child_process calls. Definition of done: `mise run hook:pre-commit` exits 0 (ignore config-map
findings on zero-byte sandbox placeholder files); paste its last 5 lines in your return. Test data outside the workspace.
Do not commit or push.

## Current state (coordinator, 11:1x — single current version)
Coordinator decision on the writes-scope contradiction: config for this kind that lives in a skill OUTSIDE your writes
(e.g. mise task fragments in wiring-mise-tasks, git/ignore fragments in other skills) is COPIED into presets/<kind>/ and
listed in your return with its source path:line; do not edit that skill. A later ticket (preset-mise / preset-git) will
replace those sources with links in one place, so parallel kind tickets never edit the same skill. Skills inside your
writes are edited as the outcome says (rule stays, config moves, link to presets/<kind>/<file>).
