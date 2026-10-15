+++
schema = 2
name = "preset-nosync"
outcome = "the node/no-sync rule has one home in the oxlint preset and reaches every consumer repo: its rule settings (error, allowAtRootLevel, tests off) move from the literal in scripts/lint-no-sync.ts:60-65 into presets/oxlint/policy.toml (rendered into .oxlintrc.json like the other house rules); scripts/lint-no-sync.ts reads the rule from the rendered config instead of hard-coding it; the ratchet (per-file baseline that only shrinks, `// sync-ok: <reason>` call-site exemption, `--init` to start) ships with the oxlint preset (presets/oxlint/preset.toml lists the script/task a consumer needs) so `mise run preset -- apply oxlint --to <repo>` gives a consumer the same rule and tooling, and the consumer starts its own baseline with --init; dotfiles' own baseline and behaviour are unchanged"
writes = ["presets/oxlint/**", "presets/tests/**", "scripts/lint-no-sync.ts", "scripts/render-oxlintrc.ts", "scripts/tests/lint-no-sync*.test.ts", "scripts/tests/render-oxlintrc*.test.ts", "mise.toml", ".oxlintrc.json", "tools/*/.changes/*.md"]
verify = ["bun test presets", "bun test scripts/tests", "mise run lint:no-sync", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 2400
premises = ["file:scripts/lint-no-sync.ts", "file:presets/oxlint/policy.toml", "file:lint/no-sync-baseline.tsv"]

[proposition]
id = "PRESET-NOSYNC"
claim = "the string `node/no-sync` appears in presets/oxlint/policy.toml and not as a rule literal in scripts/lint-no-sync.ts; a fixture consumer repo after `preset apply oxlint` + `--init` fails lint on one new fs.readFileSync and passes with `// sync-ok: reason`; dotfiles' `mise run lint:no-sync` result is unchanged (981 sites)"
refuted_by = "a second home for the rule settings, or a consumer repo that does not get the rule from the preset"
+++

Owner (2026-10-16): "presets を読んでわからなかった、no-sync はどこに設定されているの" — today the rule lives only in
scripts/lint-no-sync.ts (literal), mise.toml:350 and lint/no-sync-baseline.tsv, so consumer repos (coralbase, firedancer,
polysearch) that take presets/oxlint never get it. presets/ is the home of configuration shared with other repos
(presets/README.md, manifest contract from presets-generic 4ec3d74d). Keep the no-disable check intact. Add no sync calls.
You cannot rebase in the sandbox; land rebases. Definition of done: `mise run hook:pre-commit` exits 0; record its exit
code and last line in the checks field of your JSON return. Test data outside the workspace. Do not commit or push.
