+++
schema = 2
name = "preset-ts-ref"
outcome = "writing-typescript no longer points at a file that does not exist: SKILL.md:52-58 and tests/consumer-repo.test.ts:12,64 name assets/consumer-repo/oxlint-policy.local.toml, but consumer-repo is a symlink to presets/ts and the local-ignore sample lives at presets/oxlint/local.example.toml; the skill and its test point at the real preset files and the preset CLI (`mise run preset -- apply ts|oxlint`), and the test passes"
writes = ["agents/skills/writing-typescript/**", "tools/*/.changes/*.md"]
verify = ["bun test agents/skills/writing-typescript", "mise run lint:ts", "mise run lint:bun", "mise run typecheck", "mise run lint:md"]
timeout_s = 1500
premises = ["file:agents/skills/writing-typescript/SKILL.md", "file:presets/oxlint/local.example.toml"]

[proposition]
id = "PRESET-TS-REF"
claim = "every path the writing-typescript skill and its tests name exists at the --cd revision; the consumer-repo test passes"
refuted_by = "a dangling path in writing-typescript"
+++

Found by facts-presets (rows kind=broken-ref). Do not edit presets/ (other tickets own it).
You cannot rebase in the sandbox (the shared jj store is read-only there); land rebases. lint:no-sync is on alpha:
add no synchronous fs/child_process calls. Definition of done: `mise run hook:pre-commit` exits 0 (ignore config-map
findings on zero-byte sandbox placeholder files); paste its last 5 lines in your return. Test data outside the workspace.
Do not commit or push.
