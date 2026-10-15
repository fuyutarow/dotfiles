+++
schema = 2
name = "preset-ts-rules"
outcome = "the typescript preset's oxlint policy (presets/typescript, after presets-by-language) turns on two built-in oxlint rules as error: typescript/no-non-null-assertion and typescript/ban-ts-comment with option \"ts-expect-error\": true (both @ts-ignore and @ts-expect-error banned); the policy's \"counts measured\" lines record dotfiles' counts for both rules; dotfiles' own violations are fixed (non-null assertions replaced by narrowing or zod parsing; ts comments removed by fixing the types) so `mise run lint` passes; the rendered .oxlintrc.json and the root oxlint-policy.toml alias carry them to consumers"
writes = ["presets/typescript/**", "presets/tests/**", ".oxlintrc.json", "**/*.ts", "tools/*/.changes/*.md"]
verify = ["bun test presets", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 3600
premises = ["file:presets/typescript/preset.toml"]

[proposition]
id = "PRESET-TS-RULES"
claim = "a fixture file with `x!` and one with `// @ts-expect-error` both fail `mise run lint:ts`; dotfiles' tree passes; the policy lists both rules with measured counts"
refuted_by = "either rule missing from the rendered config, or a dotfiles violation left by disabling the rule"
+++

Requested by coralbase (owner decision 2026-10-16: "preset に入れましょう"): these are the last two ways around the preset's
zod-first type-assertion bans (`as`, `<T>`, JSON.parse … are already custom-banned). First measure dotfiles' counts with
oxlint -D on each rule; if either exceeds 60 sites, stop and return the counts per file (the coordinator will split the
fix into parallel units). Do not disable rules or add ignores. Add no sync calls. You cannot rebase in the sandbox.
Definition of done: `mise run hook:pre-commit` exits 0; record its exit code and last line in the checks field of your JSON
return. Test data outside the workspace. Do not commit or push.
