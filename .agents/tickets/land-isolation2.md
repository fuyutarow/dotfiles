+++
schema = 2
name = "land-isolation2"
outcome = "land commits from a tree that only land writes: it reads alpha and the landing workspace's diff, never another session's uncommitted edits in the main checkout; before any work it asserts its tree is clean and stops with the dirty paths named; a dirty main checkout no longer blocks a land"
writes = ["scripts/config-registry.ts", "scripts/land.ts", "scripts/land-*.ts", "scripts/tests/land*.test.ts", "scripts/tests/gate-land.test.ts", "mise.toml"]
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

## Current state (coordinator agt_g67e, 17:47)
Run 1ee2a5a8-deaa-4314-a9f9-221e9a563dbb ended; agx's verify after it failed:
- exit 1: mise run gate:land
Re-run each failing command, fix what the change causes, re-run all verify, and return a report. A failure that also
happens on a clean alpha checkout (/home/fuyu/dotfiles at alpha): show it and list it in open.

Last run (coordinator, 20:10): your previous run's agx verify failed while guest / was below the storage deny line
(17:50-20:05, every write outside cleanup was refused) and load was 14-200. Disk and load are back to normal
(49 GiB free, load ~10 on 12 cores). Re-run the full verify first; fix only what still fails, and report the load
(cat /proc/loadavg) next to any timeout.

## Current state (coordinator, 21:20)
Run 0e74cbfa: gate:land failed only at `[lint:config-map] ERROR task failed` — a file you added is in no config-registry row. Register it in scripts/config-registry.ts (add that path to writes is granted below) and re-run verify.

Diagnosis (coordinator, 21:45): the dirty path is the land tree's `node_modules`, a SYMLINK to ~/dotfiles/node_modules created by land at 17:27. The ignore rule `node_modules/` matches directories only, so jj snapshots the symlink as a new file. Fix the cause (ignore pattern that also matches the symlink, or do not create a tracked-path symlink), add a fixture with a symlinked node_modules, and keep fail-first for real dirt.
