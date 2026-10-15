+++
schema = 2
name = "gatepure2"
outcome = "the 19 remaining scripts/tests failures from gatepure are fixed: install-mcp tests use their own executable MCP fixture instead of the shared fake-claude.ts (which now only implements plugin uninstall), and the Cleye CLI corpus matches current production imports including scripts/skills-doctor.ts"
writes = ["scripts/tests/**", "agents/skills/writing-bun-scripts/tests/**", "scripts/doctor.ts", "scripts/wsl-ccc-daemon.ts", "mise.toml"]
verify = ["bun test scripts/tests", "env HOME=$(mktemp -d) mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/tests/fake-claude.ts"]

[proposition]
id = "SCRIPTS-TESTS-GREEN"
claim = "bun test scripts/tests has zero failures in the normal environment and with HOME pointed at an empty temp dir and ~/.bun/bin removed from PATH"
refuted_by = "any failure in either environment"
+++

gatepure (run 280c5276) made gate:land pass with an empty HOME and returned with 19 failures that are not machine
state: 17 install-mcp tests (alphabetical registration, remove before add, codex:config delegation, add failure stops,
exit-code preservation, uv/ccc absence handling, drift reporting, MCP_PRUNE, dry-run, DOTFILES fallback) fail because
scripts/tests/fake-claude.ts is not executable and only implements plugin uninstall now; and 2 tests expect
scripts/skills-doctor.ts to be a Cleye CLI in the production corpus.
Do: split an executable MCP fixture for install-mcp tests (keep fake-claude.ts for its current users); update the Cleye
corpus/CLI boundary expectations to the current implementation; run scripts/tests in both environments. Use
`MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)` for mise in the sandbox. Do not commit or push.

## Current state (coordinator, 2026-10-15 15:15)
Run 96e88996 added the MCP fixture and updated the corpus; it returned on failures outside the brief and a nesting lint
error in the new fixture. Two consolidations:
1. gatepure (run 280c5276, workspace /home/fuyu/dotfiles-ws-gatepure; read it, do not write it) could not land: rebase
   conflict in mise.toml. Port its change into this workspace (doctor GPU-only ccc check, machine-state tests moved to
   fixtures or doctor-only suites, mise.toml task split), merging mise.toml by meaning with alpha.
2. Fix the fixture lint error. For the other failing tests: list each (name, file, cause). Fix those under
   scripts/tests whose cause is the test or its fixture; report the rest without changing production code.
Verify with `MISE_TRUSTED_CONFIG_PATHS=$PWD MISE_STATE_DIR=$(mktemp -d)` prefixed. Do not commit or push.
