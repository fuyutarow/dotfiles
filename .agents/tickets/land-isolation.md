+++
schema = 2
name = "land-isolation"
outcome = "land commits from a tree that only land writes: it reads alpha and the landing workspace's diff, never another session's uncommitted edits in the main checkout; before any work it asserts its tree is clean and stops with the dirty paths named; a dirty main checkout no longer blocks a land"
writes = ["scripts/land.ts", "scripts/land-*.ts", "scripts/tests/land*.test.ts", "scripts/tests/gate-land.test.ts", "mise.toml"]
verify = ["bun test scripts/tests/land.test.ts", "mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/land.ts"]

[proposition]
id = "LAND-OWN-TREE"
claim = "with an unrelated uncommitted edit in the main checkout that fails a pre-commit lint, a land of a clean workspace succeeds, moves alpha, pushes, and leaves the main checkout's edit untouched; a land whose own tree is dirty stops before rebase with the paths named"
refuted_by = "a fixture where a main-checkout edit blocks or is swept into a land, or land starts work on a dirty tree of its own"
+++

Observed 2026-10-15 16:26-16:45: 18 accepted lands failed at the commit stage because scripts/land.ts:797
`mainCheckout(root)` always commits in ~/dotfiles, whose working copy held an unrelated uncommitted edit
(git/ignore:10) that failed lint:ignore in the pre-commit. Running land from another workspace does not help.
Unix: land's inputs are alpha and the landing diff; Tiger: assert the precondition at the boundary and fail before work.
Choose the mechanism (a dedicated lander jj workspace that land owns and resets to alpha, or another). Keep the
existing land lock, rollback and report contract; update land's tests. Do not commit or push.

## Current state (coordinator agt_g67e, 17:30) — live regression after landing (alpha 063daead)
Your change landed and the first land on it succeeded. Every later land then stopped at preflight with
`[land] preflight: FAIL dirty land tree: ["node_modules"]` (15 lands, 17:27:50-17:28:08, logs
/home/fuyu/.cache/coord/land-*.txt): the gate run in the dedicated land tree creates ignored dependency output
(node_modules from bun install) and the dirty check counts it. "Clean" must mean: no tracked change and no untracked
file that the repo's ignore rules do not ignore. Fix it in this workspace on top of current alpha, add a fixture that
lands twice in a row with a gate that installs dependencies, and re-run verify. Keep fail-first for real dirt.
