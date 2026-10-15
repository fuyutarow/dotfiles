+++
schema = 2
name = "facts-presets"
outcome = "a read-only inventory, returned in your final agx-return as a table, of every PROJECT CONFIGURATION embedded in agents/skills/** (assets/, references/, SKILL.md code blocks, scripts that write config): one row per config with ecosystem (uv/python, cargo/rust, julia, ts, latex, textlint/prose, mise, git/ignore, other), the skill and path:line where it lives, what file it becomes in a consumer repo (e.g. pyproject.toml [tool.ruff], Cargo.toml [lints], Project.toml, rustfmt.toml, latexmkrc, .textlintrc.json), whether the same config is duplicated in another skill or in presets/ (and whether the copies differ), and which skill text would need to point at presets/ instead; document templates (TASK-CONTINUATION.md, OPEN_ISSUE.md …) and code examples are listed separately as NOT presets"
writes = []
verify = []
timeout_s = 1800
premises = ["file:presets/README.md", "file:agents/skills"]

[proposition]
id = "FACTS-PRESETS"
claim = "every project-config fragment under agents/skills is a row with path:line and target filename; every row's locus exists at the --cd revision"
refuted_by = "a config fragment in agents/skills that is not in the table, or a locus that does not exist"
+++

Owner (2026-10-16): presets/ is meant to hold config presets per project kind — uv project, cargo project, julia project,
ts project — because today those assets are buried inside skills. presets/ currently holds only ts/ and oxlint/
(presets/README.md) with a CLI hard-coded to those two (presets/src/cli.ts:53). Use rr for search (raw grep is denied).
Read only; do not edit files.

## Current state (coordinator, 10:2x — single current version)
Your first run (e363ad15) correctly reported a broken reference: writing-typescript/SKILL.md:52-58 and
tests/consumer-repo.test.ts:12,64 point at assets/consumer-repo/oxlint-policy.local.toml, which does not exist
(consumer-repo is a symlink to presets/ts; the local-ignore sample lives at presets/oxlint/local.example.toml).
For THIS ticket, a broken or dangling reference is a finding: add it as a row (kind = broken-ref) and keep going — do
not stop on it. Continue the inventory from your partial table (python quality.md/research.md, rust project.md, …) to
cover all of agents/skills; if `rr regex` hits "Resource temporarily unavailable", narrow --path and retry. Read only.

