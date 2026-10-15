+++
schema = 2
name = "presets-generic"
outcome = "presets/ is the home of per-project-kind configuration presets: each preset is one directory presets/<name>/ with a `preset.toml` (name, description, `files = [{ source, destination }]`, optional `check = [commands]` that prove the preset with its fixtures); the CLI (`mise run preset -- apply|diff <name> --to <repo>`, presets/src/cli.ts) discovers presets from those manifests instead of the hard-coded `ts`/`oxlint` names (cli.ts:53), keeps today's behaviour for ts and oxlint (their manifests express it; oxlint's render step stays), and `preset list` prints the available presets; presets/README.md is rewritten as \"configuration presets per project kind (uv, cargo, julia, ts, latex, textlint …)\" with the manifest contract, so new kinds are added by a directory, not by code"
writes = ["presets/**", "mise.toml", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test presets", "mise run lint:ts", "mise run lint:bun", "mise run typecheck"]
timeout_s = 2400
premises = ["file:presets/src/cli.ts", "file:presets/README.md"]

[proposition]
id = "PRESETS-MANIFEST"
claim = "fixtures: a new presets/demo/preset.toml with one file appears in `preset list` and applies/diffs with no CLI change; ts and oxlint apply/diff produce byte-identical results to before; a manifest naming a missing source fails with the path"
refuted_by = "a new preset kind that needs a CLI edit, or a changed ts/oxlint output"
+++

Owner (2026-10-16): presets/ should hold config presets per project kind (uv, cargo, julia, ts …) because those assets are
buried in skills today. Other tickets will add presets/<kind>/ directories in parallel following the manifest contract
above; keep the contract exactly as written so they do not need you. Do not move anything out of agents/skills (later
tickets do that). Follow lint:no-sync (now on alpha). Test data outside the workspace. Do not commit or push.
