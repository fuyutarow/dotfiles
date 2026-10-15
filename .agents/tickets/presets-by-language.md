+++
schema = 2
name = "presets-by-language"
outcome = "presets/ is organised by language, one directory per language, each with a preset.toml: presets/typescript (merges today's presets/ts and presets/oxlint: tsconfig, package.json, zod.ts, mise tasks, the oxlint policy and its local-ignore example), presets/python (today's presets/uv), presets/rust (today's presets/cargo), presets/julia, presets/latex; presets/textlint is deleted (textlint is no longer used) and no skill links to it; the node/no-sync rule settings live in presets/typescript's oxlint policy (one home) and scripts/lint-no-sync.ts reads them from the rendered config instead of a literal; every reference is updated (skills' links, mise tasks such as `preset -- apply typescript`, presets/README.md, tests, dotfiles' root tsconfig.json/.oxlintrc.json derivation); the root oxlint-policy.toml alias that consumer repos (coralbase, firedancer) use keeps working by pointing at the new location; `mise run preset -- list` prints exactly typescript, python, rust, julia, latex"
writes = ["presets/**", "agents/skills/writing-typescript/**", "agents/skills/writing-python/**", "agents/skills/running-python-tools/**", "agents/skills/writing-rust/**", "agents/skills/writing-julia/**", "agents/skills/optimizing-julia-gpu-kernels/**", "agents/skills/compiling-latex/**", "agents/skills/linting-prose/**", "scripts/lint-no-sync.ts", "scripts/render-oxlintrc.ts", "scripts/tests/**", "mise.toml", "oxlint-policy.toml", ".oxlintrc.json", "tsconfig.json", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test presets", "mise run preset -- list", "mise run lint:no-sync", "mise run lint:ts", "mise run lint:bun", "mise run typecheck", "mise run lint:md"]
timeout_s = 3000
premises = ["file:presets/README.md", "file:presets/src/cli.ts", "file:scripts/lint-no-sync.ts"]

[proposition]
id = "PRESETS-BY-LANGUAGE"
claim = "`preset list` = typescript, python, rust, julia, latex; apply+diff of each on an empty temp repo exits 0; ts/oxlint output of the new typescript preset is byte-identical to before except for the one added node/no-sync rule entry; no path under agents/skills or presets points at a removed directory; `node/no-sync` is configured only in presets/typescript's policy; dotfiles' lint:no-sync still reports 981 sites; oxlint-policy.toml at the root resolves"
refuted_by = "a dangling link to presets/ts, presets/oxlint, presets/uv, presets/cargo or presets/textlint, a second home for the no-sync rule, or a consumer alias that no longer resolves"
+++

Owner (2026-10-16): presets are organised per language — julia, python, rust, typescript (+ latex); oxlint is TypeScript
tooling and belongs inside typescript; textlint is no longer used (delete its preset; do not rewrite linting-prose's
rules otherwise — only remove dead links to presets/textlint); node/no-sync is oxlint's own rule and its setting belongs
in the typescript policy. The manifest contract is presets-generic's (preset.toml: name, description, files, check).
Use `jj mv`-style moves (keep history readable). Add no sync calls. You cannot rebase in the sandbox; land rebases.
Definition of done: `mise run hook:pre-commit` exits 0; record its exit code and last line in the checks field of your
JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator correction — single current version)
You correctly stopped: "byte-identical oxlint output" and "add node/no-sync to that output" contradicted each other. The
acceptance is now: identical except for the single added node/no-sync rule entry (and its test-file override), which is
the point of this change. Continue from your workspace.

