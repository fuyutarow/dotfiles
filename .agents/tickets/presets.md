+++
schema = 2
name = "presets"
outcome = "a top-level presets/ directory is the one home of project configuration presets consumed OUTSIDE dotfiles (first: TypeScript tsconfig and the oxlint policy); each preset has fixtures proving what it accepts and what it rejects; a CLI writes a preset into a target repo and reports drift; dotfiles' own root tsconfig.json and .oxlintrc.json are derived from the same presets, so dotfiles' gate exercises them"
writes = ["presets/**", "oxlint-policy.toml", "tsconfig.json", ".oxlintrc.json", "oxlint-policy.toml", "scripts/oxlint-*.ts", "scripts/tests/oxlint-policy.test.ts", "agents/skills/writing-typescript/assets/**", "scripts/config-registry.ts", "mise.toml", "package.json"]
verify = ["bun test presets", "bun test scripts/tests/oxlint-policy.test.ts", "mise run lint:oxlint-policy", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 3000
premises = ["file:tsconfig.json", "task:lint:oxlint-policy"]

[proposition]
id = "PRESETS-ONE-HOME"
claim = "the TypeScript and oxlint presets live only under presets/, dotfiles' own configs are fresh derivations of them, and each preset's fixtures pass and fail exactly as declared"
refuted_by = "a second copy of the tsconfig or oxlint policy outside presets/ that is not checked for drift, or a fixture declared bad that the preset accepts (or good that it rejects)"
+++

Owner's decision (2026-10-15): presets live at top-level `presets/`, not under a skill and not under tools/, because
they are consumed outside dotfiles (e.g. /home/fuyu/Workspace/coralbase). Skills only explain when to use a preset.
Document templates that a skill fills in (assets/*.md) stay in their skills.

Existing machinery (reuse it, do not rebuild):
- oxlint-policy.toml at the repo root is the one home of the TS lint policy (rules, reasons, custom bans with bad/good
  snippets). `mise run oxlint:render` renders it into .oxlintrc.json; `lint:oxlint-policy` fails on drift;
  scripts/tests/oxlint-policy.test.ts checks every custom ban fires on its bad snippet and is silent on its good one.
  A consumer repo adds only ignores through oxlint-policy.local.toml (the renderer rejects other keys).
- agents/skills/writing-typescript/assets/consumer-repo/ holds the consumer kit: tsconfig.json, package.json,
  oxlint-policy.local.toml, mise-tasks.toml, zod.ts. Its tsconfig differs from dotfiles' root tsconfig.json.
Layout:
  presets/README.md                                 what each preset is, who consumes it, how to apply and check
  presets/ts/{tsconfig.json, package.json, zod.ts, mise-tasks.toml}
  presets/oxlint/{policy.toml, local.example.toml}  (oxlint-policy.toml moves here)
  presets/tests/fixtures/<preset>/{good,bad}/…      minimal repos: good must pass tsgo/oxlint, each bad must fail on
                                                    the named rule
  presets/src/cli.ts                                `preset apply <name> --to <dir> [--dry-run]` and
                                                    `preset diff <name> <dir>` (exit 1 on drift, unified diff on
                                                    stdout); Cleye per this repo's script rules
Do:
1. Move the policy and the consumer kit into presets/ (jj tracks moves), keeping the renderer and its tests working
   against the new path. Leave a short pointer in agents/skills/writing-typescript/assets/ only if a skill body links
   there; otherwise remove the directory. Do NOT edit any *.md under agents/skills (ticket skillsbareprose is editing
   skill prose now; list the links that must change in your report instead).
2. Strictness rule (owner, 2026-10-15): dotfiles uses the strictest TypeScript and lint settings, and the presets
   inherit exactly that. The ts preset IS dotfiles' current root tsconfig.json compilerOptions (Coral-dpp-strict,
   incl. noUncheckedIndexedAccess, exactOptionalPropertyTypes; keep its explanatory comments in presets/ts). The
   oxlint preset IS oxlint-policy.toml. Measured diff root vs consumer-repo tsconfig (coordinator): only letter case
   of target/lib/module and consumer-only `preserveConstEnums: true`; no strictness flag differs. Drop
   preserveConstEnums unless you show it is needed. dotfiles' root tsconfig.json then extends presets/ts with no
   overrides except dotfiles-only paths/include. A preset may never be looser than what dotfiles uses: add a test
   that fails if any strictness flag in the ts preset is weaker than in the root config, and a test that the oxlint
   preset has no rule set below dotfiles' level. Consumers may only tighten (or, for oxlint, add reasoned ignores
   through local.toml as today); `preset diff` reports any loosening in a consumer as drift.
3. Fixtures and tests as above, including at least: `any` rejected, unchecked index access rejected, a throwing
   `.parse` rejected (existing custom ban).
4. CLI and a mise task `preset` (or `preset:apply` / `preset:diff`). Register presets/ in config-registry.
The workspace already holds an interrupted run's moves (consumer-repo -> presets/ts, oxlint-policy.toml -> presets/oxlint); build on them.
Do not write into any repo outside dotfiles; the consumer inventory is ticket presetsinv, running in parallel.
README.md / CLAUDE.md text is deferred until skillsbareprose lands; put the needed text in presets/README.md and list
the README/CLAUDE.md lines to change in your report. Do not commit or push.

## Current state (coordinator, 2026-10-15 15:20)
Run 54db1baa is accepted except one consumer break. The inventory (presetsinv) found that coralbase and firedancer
reference `~/dotfiles/oxlint-policy.toml` in tasks and docs; your diff renames it to presets/oxlint/policy.toml without
leaving a compatibility path at the root. Add a relative symlink `oxlint-policy.toml -> presets/oxlint/policy.toml`
at the repo root (git-tracked), make lint:oxlint-policy and the renderer work with it, and state in presets/README.md
that the root path is a compatibility alias for external consumers (coralbase, firedancer) until they migrate. Keep
`tsconfig.json` and `scripts/render-oxlintrc.ts` where they are. Re-run verify. No rebase. Do not commit or push.
